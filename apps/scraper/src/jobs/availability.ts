import type {
  AvailabilityRecord,
  AvailabilityScraper,
  SiteName,
  Therapist,
} from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import {
  diffHttpMetrics,
  isGonePageError,
  snapshotHttpMetrics,
} from '../lib/http.js';
import { caskanAvailabilityScraper } from '../scrapers/caskan/availability.js';
import { growAvailabilityScraper } from '../scrapers/grow/availability.js';
import { edcAvailabilityScraper } from '../scrapers/edc/availability.js';
import { estamaAvailabilityScraper } from '../scrapers/estama/availability.js';

const log = createLogger('job:availability');

interface WatchTargetRow {
  id: string;
  therapist_id: string;
  name: string;
  salon_id: string;
  salons: {
    shop_id: string;
    sites: { name: SiteName } | { name: SiteName }[] | null;
  } | {
    shop_id: string;
    sites: { name: SiteName } | { name: SiteName }[] | null;
  }[] | null;
}

function pickScraper(siteName: SiteName): AvailabilityScraper {
  switch (siteName) {
    case 'caskan':
      return caskanAvailabilityScraper;
    case 'grow':
      return growAvailabilityScraper;
    case 'edc':
      return edcAvailabilityScraper;
    case 'estama':
      return estamaAvailabilityScraper;
  }
}

function unwrapNested<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

async function fetchWatchedTherapists(): Promise<Therapist[]> {
  // watch_settings に登録されているセラピストのみ重複排除して取得する。
  // 親 salon が論理削除されているケース (Stage 2 で 404/410 検出など) は
  // セラピスト側の deleted_at 反映が遅れる前に取りこぼさないよう、ここでも除外する。
  const { data, error } = await supabase
    .from('therapists')
    .select(
      'id, therapist_id, name, salon_id, ' +
        'salons!inner(shop_id, deleted_at, sites!inner(name)), ' +
        'watch_settings!inner(id, is_active, deleted_at)',
    )
    .is('deleted_at', null)
    .is('salons.deleted_at', null)
    .is('watch_settings.deleted_at', null)
    .eq('watch_settings.is_active', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`Failed to fetch watched therapists: ${error.message}`);
  }

  const seen = new Set<string>();
  const therapists: Therapist[] = [];

  for (const row of (data ?? []) as unknown as WatchTargetRow[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const salon = unwrapNested(row.salons);
    if (!salon) continue;
    const site = unwrapNested(salon.sites);
    if (!site) continue;

    therapists.push({
      id: row.id,
      salon_id: row.salon_id,
      salon_shop_id: salon.shop_id,
      site_name: site.name,
      therapist_id: row.therapist_id,
      name: row.name,
    });
  }

  return therapists;
}

async function upsertAvailability(
  therapist: Therapist,
  records: AvailabilityRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const { error } = await supabase.rpc('upsert_availability', {
    p_therapist_id: therapist.id,
    p_rows: records,
  });
  if (error) {
    throw new Error(`upsert_availability RPC failed: ${error.message}`);
  }
}

async function markTherapistSynced(therapistId: string): Promise<void> {
  const { error } = await supabase
    .from('therapists')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', therapistId);
  if (error) {
    log.warn('Failed to update therapists.last_synced_at', {
      therapist_id: therapistId,
      error: error.message,
    });
  }
}

/**
 * セラピスト個別ページが恒久的に消えた (404/410) ケースで therapists を論理削除する。
 *
 * salon 単位の判断は Stage 2 (therapists ジョブ) に任せ、ここではセラピスト単位だけ閉じる
 * (1人だけ卒業/転店した可能性が高く、保守的に振る舞う)。
 * salon ごと閉店している場合は次回 Stage 2 で salon ごと soft-delete される。
 */
async function softDeleteMissingTherapist(therapistId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('therapists')
    .update({ deleted_at: now })
    .eq('id', therapistId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(`Failed to soft-delete therapist: ${error.message}`);
  }
}

/** 初回の空き同期が終わるまで新規行通知を抑止するためのマーカー（セラピスト単位・NULL の監視のみ） */
async function markFirstAvailabilitySyncedIfNeeded(therapistId: string): Promise<void> {
  const { error } = await supabase
    .from('watch_settings')
    .update({ first_availability_synced_at: new Date().toISOString() })
    .eq('therapist_id', therapistId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .is('first_availability_synced_at', null);
  if (error) {
    log.warn('Failed to update watch_settings.first_availability_synced_at', {
      therapist_id: therapistId,
      error: error.message,
    });
  }
}

async function enqueueNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc('enqueue_notifications');
  if (error) {
    throw new Error(`enqueue_notifications RPC failed: ${error.message}`);
  }
  if (typeof data === 'number') return data;
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0];
  return 0;
}

export interface RunAvailabilityOptions {
  /**
   * セラピスト同時処理数。1 で従来どおり完全直列。
   * 省略時は env.AVAILABILITY_CONCURRENCY。
   *
   * HostQueue がホスト単位でリクエストを直列化するため、ここを上げても
   * 単一サイトへの負荷は守られる (= サイト数×ホスト並列度 が実効上限)。
   */
  concurrency?: number;
}

type SiteSummary = {
  therapists: number;
  success: number;
  failure: number;
  slots: number;
  elapsedMs: number;
  maxElapsedMs: number;
};

/**
 * 並列度 N のシンプルなワーカープール。
 * 完了順を保持する必要は無いので、各ワーカーが共有キューから取り出す方式。
 */
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

function formatHttpMetricsLine(
  diffs: Record<string, { requests: number; errors: number; retries: number; totalElapsedMs: number; maxElapsedMs: number }>,
): Record<string, { req: number; err: number; retries: number; avgMs: number; maxMs: number }> {
  const out: Record<string, { req: number; err: number; retries: number; avgMs: number; maxMs: number }> = {};
  for (const [name, m] of Object.entries(diffs)) {
    if (m.requests === 0 && m.errors === 0) continue;
    out[name] = {
      req: m.requests,
      err: m.errors,
      retries: m.retries,
      avgMs: m.requests > 0 ? Math.round(m.totalElapsedMs / m.requests) : 0,
      maxMs: m.maxElapsedMs,
    };
  }
  return out;
}

export async function runAvailabilityJob(opts: RunAvailabilityOptions = {}): Promise<void> {
  const concurrency = Math.max(1, opts.concurrency ?? env.AVAILABILITY_CONCURRENCY);
  const therapists = await fetchWatchedTherapists();

  // サイト別の事前カウントは負荷見積もりに便利なので最初にログる。
  const bySite: Record<string, number> = {};
  for (const t of therapists) {
    bySite[t.site_name] = (bySite[t.site_name] ?? 0) + 1;
  }
  log.info(`Found ${therapists.length} watched therapist(s)`, {
    concurrency,
    bySite,
  });

  const httpBefore = snapshotHttpMetrics();
  const jobStarted = Date.now();

  const siteSummary = new Map<string, SiteSummary>();
  function bumpSite(site: string, patch: Partial<SiteSummary>): void {
    let s = siteSummary.get(site);
    if (!s) {
      s = { therapists: 0, success: 0, failure: 0, slots: 0, elapsedMs: 0, maxElapsedMs: 0 };
      siteSummary.set(site, s);
    }
    if (patch.therapists !== undefined) s.therapists += patch.therapists;
    if (patch.success !== undefined) s.success += patch.success;
    if (patch.failure !== undefined) s.failure += patch.failure;
    if (patch.slots !== undefined) s.slots += patch.slots;
    if (patch.elapsedMs !== undefined) {
      s.elapsedMs += patch.elapsedMs;
      if (patch.elapsedMs > s.maxElapsedMs) s.maxElapsedMs = patch.elapsedMs;
    }
  }

  let success = 0;
  let failure = 0;
  let softDeleted = 0;
  let totalSlots = 0;

  await runWithConcurrency(therapists, concurrency, async (therapist) => {
    const scraper = pickScraper(therapist.site_name);
    const startedAt = Date.now();
    bumpSite(therapist.site_name, { therapists: 1 });
    try {
      const records = await scraper.run(therapist);
      if (records.length > 0) {
        await upsertAvailability(therapist, records);
      }
      // 0 件でも初回同期済みにする（初回だけ枠ゼロのときに永久に Path B が解禁されないように）
      await markFirstAvailabilitySyncedIfNeeded(therapist.id);
      await markTherapistSynced(therapist.id);
      const elapsed = Date.now() - startedAt;
      success += 1;
      totalSlots += records.length;
      bumpSite(therapist.site_name, {
        success: 1,
        slots: records.length,
        elapsedMs: elapsed,
      });
      log.info('Synced therapist', {
        site: therapist.site_name,
        therapist: therapist.name,
        slots: records.length,
        ms: elapsed,
      });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      if (isGonePageError(err)) {
        try {
          await softDeleteMissingTherapist(therapist.id);
          softDeleted += 1;
          bumpSite(therapist.site_name, { elapsedMs: elapsed });
          log.warn('Soft-deleted therapist: page gone (404/410)', {
            site: therapist.site_name,
            therapist: therapist.name,
            therapist_id: therapist.id,
            ms: elapsed,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        } catch (cleanupErr) {
          log.error('Failed to soft-delete missing therapist', {
            site: therapist.site_name,
            therapist: therapist.name,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }
      failure += 1;
      bumpSite(therapist.site_name, { failure: 1, elapsedMs: elapsed });
      log.error('Failed to sync therapist', {
        site: therapist.site_name,
        therapist: therapist.name,
        ms: elapsed,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const jobElapsedMs = Date.now() - jobStarted;
  const httpDiff = diffHttpMetrics(httpBefore, snapshotHttpMetrics());

  // サイト別の集計をログに出す。avgMs はセラピスト単位の平均同期時間 (HTTP + DB込み)。
  const siteReport: Record<string, {
    therapists: number;
    success: number;
    failure: number;
    slots: number;
    avgMs: number;
    maxMs: number;
  }> = {};
  for (const [site, s] of siteSummary.entries()) {
    siteReport[site] = {
      therapists: s.therapists,
      success: s.success,
      failure: s.failure,
      slots: s.slots,
      avgMs: s.therapists > 0 ? Math.round(s.elapsedMs / s.therapists) : 0,
      maxMs: s.maxElapsedMs,
    };
  }

  let notified = 0;
  if (success > 0) {
    try {
      notified = await enqueueNotifications();
    } catch (err) {
      log.error('Failed to enqueue notifications', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info('Stage 3 complete', {
    therapists: therapists.length,
    success,
    failure,
    softDeleted,
    slots: totalSlots,
    notified,
    elapsedMs: jobElapsedMs,
    concurrency,
    bySite: siteReport,
    http: formatHttpMetricsLine(httpDiff),
  });
}
