import type { OfficialShiftRecord } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { emitJobMetrics } from '../lib/metrics.js';
import { env } from '../lib/env.js';
import {
  diffHttpMetrics,
  snapshotHttpMetrics,
} from '../lib/http.js';
import { officialShiftScraper } from '../scrapers/official/shifts.js';

const log = createLogger('job:official_shifts');

interface TargetRow {
  /** therapists.id (our internal id) */
  internal_therapist_id: string;
  /** external_therapists.id */
  external_therapist_id: string;
  /** 公式サイト個別ページ URL */
  therapist_url: string;
  /** ログ表示用のセラピスト名 */
  therapist_name: string;
}

interface QueryRow {
  id: string;
  name: string;
  external_therapist_id: string | null;
  external_therapists:
    | {
        id: string;
        therapist_url: string | null;
        deleted_at: string | null;
      }
    | {
        id: string;
        therapist_url: string | null;
        deleted_at: string | null;
      }[]
    | null;
}

function unwrapNested<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Stage 5 のスクレイピング対象。
 *
 * - watch_settings が active で 1 件以上ある therapist
 * - その therapist が external_therapists にリンク済み (external_therapist_id IS NOT NULL)
 * - external_therapists.therapist_url が非 null かつ deleted_at が null
 *
 * therapists.last_synced_at で公平に古い順に並べるが、Stage 3 と違って
 * シフト発見が「最新性勝負」ではないため必須条件ではない。
 */
async function fetchTargets(): Promise<TargetRow[]> {
  const { data, error } = await supabase
    .from('therapists')
    .select(
      'id, name, external_therapist_id, ' +
        'external_therapists!inner(id, therapist_url, deleted_at), ' +
        'watch_settings!inner(id, is_active, deleted_at)',
    )
    .is('deleted_at', null)
    .not('external_therapist_id', 'is', null)
    .is('external_therapists.deleted_at', null)
    .not('external_therapists.therapist_url', 'is', null)
    .is('watch_settings.deleted_at', null)
    .eq('watch_settings.is_active', true);

  if (error) {
    throw new Error(`Failed to fetch official_shifts targets: ${error.message}`);
  }

  const seen = new Set<string>();
  const rows: TargetRow[] = [];
  for (const raw of (data ?? []) as unknown as QueryRow[]) {
    if (seen.has(raw.id)) continue;
    const ext = unwrapNested(raw.external_therapists);
    if (!ext || !ext.therapist_url) continue;
    if (!raw.external_therapist_id) continue;
    seen.add(raw.id);
    rows.push({
      internal_therapist_id: raw.id,
      external_therapist_id: raw.external_therapist_id,
      therapist_url: ext.therapist_url,
      therapist_name: raw.name,
    });
  }
  return rows;
}

async function upsertShifts(
  externalTherapistId: string,
  records: OfficialShiftRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase.rpc('upsert_external_therapist_shifts', {
    p_external_therapist_id: externalTherapistId,
    p_rows: records,
  });
  if (error) {
    throw new Error(`upsert_external_therapist_shifts RPC failed: ${error.message}`);
  }
}

async function enqueueShiftNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc('enqueue_shift_notifications');
  if (error) {
    throw new Error(`enqueue_shift_notifications RPC failed: ${error.message}`);
  }
  if (typeof data === 'number') return data;
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0];
  return 0;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const effective = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const runners: Promise<void>[] = [];
  for (let i = 0; i < effective; i++) {
    runners.push(
      (async () => {
        while (true) {
          const index = cursor++;
          if (index >= items.length) return;
          await worker(items[index]!, index);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

export interface RunOfficialShiftsOptions {
  /**
   * セラピスト同時処理数。省略時は env.OFFICIAL_SHIFTS_CONCURRENCY。
   * HostQueue がホスト単位で直列化するため、ここを上げてもホスト単位の負荷は守られる。
   */
  concurrency?: number;
}

export async function runOfficialShiftsJob(
  opts: RunOfficialShiftsOptions = {},
): Promise<void> {
  const concurrency = Math.max(1, opts.concurrency ?? env.OFFICIAL_SHIFTS_CONCURRENCY);
  const targets = await fetchTargets();

  log.info(`Found ${targets.length} target therapist(s) for official_shifts`, {
    concurrency,
  });

  const httpBefore = snapshotHttpMetrics();
  const jobStarted = Date.now();

  let success = 0;
  let failure = 0;
  let totalShifts = 0;
  let totalUpsertedTherapists = 0;

  await runWithConcurrency(targets, concurrency, async (target) => {
    const startedAt = Date.now();
    try {
      const records = await officialShiftScraper.run(target.therapist_url);
      if (records.length > 0) {
        await upsertShifts(target.external_therapist_id, records);
        totalUpsertedTherapists += 1;
      }
      success += 1;
      totalShifts += records.length;
      log.info('Synced official shifts', {
        therapist: target.therapist_name,
        url: target.therapist_url,
        shifts: records.length,
        ms: Date.now() - startedAt,
      });
    } catch (err) {
      failure += 1;
      log.error('Failed to sync official shifts', {
        therapist: target.therapist_name,
        url: target.therapist_url,
        ms: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 1 件でも upsert があれば enqueue を呼ぶ。0 件のときは Rule A の候補も無いので
  // 余計な RPC コストを節約。
  let notified = 0;
  if (totalUpsertedTherapists > 0) {
    try {
      notified = await enqueueShiftNotifications();
    } catch (err) {
      log.error('Failed to enqueue shift notifications', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const jobElapsedMs = Date.now() - jobStarted;
  const httpDiff = diffHttpMetrics(httpBefore, snapshotHttpMetrics());

  log.info('Stage 5 (official_shifts) complete', {
    targets: targets.length,
    success,
    failure,
    upserted_therapists: totalUpsertedTherapists,
    total_shifts: totalShifts,
    notified,
    elapsedMs: jobElapsedMs,
    concurrency,
    http: Object.fromEntries(
      Object.entries(httpDiff)
        .filter(([, m]) => m.requests > 0 || m.errors > 0)
        .map(([name, m]) => [
          name,
          {
            req: m.requests,
            err: m.errors,
            retries: m.retries,
            avgMs: m.requests > 0 ? Math.round(m.totalElapsedMs / m.requests) : 0,
            maxMs: m.maxElapsedMs,
          },
        ]),
    ),
  });

  emitJobMetrics('official_shifts', {
    durationMs: jobElapsedMs,
    recordsProcessed: notified,
  });
}
