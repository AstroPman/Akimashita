import type {
  AvailabilityRecord,
  AvailabilityScraper,
  SiteName,
  Therapist,
} from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { emitJobMetrics } from '../lib/metrics.js';
import { env } from '../lib/env.js';
import {
  diffHttpMetrics,
  isCircuitBreakerError,
  isGonePageError,
  snapshotHttpMetrics,
} from '../lib/http.js';
import { caskanAvailabilityScraper } from '../scrapers/caskan/availability.js';
import { growAvailabilityScraper } from '../scrapers/grow/availability.js';
import { edcAvailabilityScraper } from '../scrapers/edc/availability.js';
import { estamaAvailabilityScraper } from '../scrapers/estama/availability.js';
import { eyoyakuAvailabilityScraper } from '../scrapers/eyoyaku/availability.js';

const log = createLogger('job:availability');

/**
 * `get_watch_availability_targets` / `get_research_availability_targets` RPC の
 * 戻り行。Therapist 型と完全互換になるようサーバ側で整形済み。
 *
 * 旧実装は PostgREST 埋め込み JOIN (therapists?select=...,salons!inner(...,sites!inner(...)),
 * watch_settings!inner(...)) で取っていたが、`work_mem` を超えるディスクソートが
 * 発生し Disk IO Budget を圧迫していた。RPC 側で起点を `watch_settings` 側に
 * 反転して planner に短い経路を選ばせる。
 */
interface TargetTherapistRow {
  id: string;
  therapist_id: string;
  name: string;
  salon_id: string;
  salon_shop_id: string;
  site_name: SiteName;
}

/**
 * Stage 3 のスクレイピング対象セラピスト。
 *
 * - `is_watched=true`: 少なくとも 1 件の有効な watch_settings を持つ。
 *   差分通知パスに乗り、`first_availability_synced_at` の初期化も必要。
 *   watch モードでだけ生成される。
 * - `is_watched=false`: watch_settings を一切持たず、salons.research_enabled=true 由来で
 *   人気指標計測のためだけにスクレイピングする「研究対象」セラピスト。
 *   通知パスには乗らない。research モードでだけ生成される。
 *
 * mode と is_watched の対応は 1:1 で、両方の Lambda が同じセラピストを
 * 同時に対象にすることは無い (= research 側で watch 側の差分検知を
 * 奪ってしまう問題が起きない)。
 */
type TargetTherapist = Therapist & { is_watched: boolean };

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
    case 'eyoyaku':
      return eyoyakuAvailabilityScraper;
  }
}

function toTherapist(row: TargetTherapistRow): Therapist {
  return {
    id: row.id,
    salon_id: row.salon_id,
    salon_shop_id: row.salon_shop_id,
    site_name: row.site_name,
    therapist_id: row.therapist_id,
    name: row.name,
  };
}

async function fetchWatchedTherapistRows(): Promise<TargetTherapistRow[]> {
  // 起点を `watch_settings` 側に反転した RPC を呼ぶ。
  // 親 salon が論理削除されているケース (Stage 2 で 404/410 検出など) も
  // RPC 内の JOIN で除外済み。
  const { data, error } = await supabase.rpc('get_watch_availability_targets');
  if (error) {
    throw new Error(`Failed to fetch watched therapists: ${error.message}`);
  }
  return (data ?? []) as unknown as TargetTherapistRow[];
}

async function fetchResearchTherapistRows(): Promise<TargetTherapistRow[]> {
  // salons.research_enabled = true なサロン配下のセラピストのうち、
  // watch_settings に有効行を持つセラピストは RPC 内で NOT EXISTS 除外済み。
  const { data, error } = await supabase.rpc('get_research_availability_targets');
  if (error) {
    throw new Error(`Failed to fetch research therapists: ${error.message}`);
  }
  return (data ?? []) as unknown as TargetTherapistRow[];
}

/**
 * research モードで「watch 配下と被って除外した」件数を返す。
 *
 * 0 が期待値。継続的に非 0 ならフラグの付け方が watch ユーザと競合しているサイン。
 * RPC 側で集約済みのスカラを返すだけなので、旧実装のように watch_settings 全件 SELECT
 * + メモリ集合演算する必要はない。
 */
async function fetchResearchExcludedWatchedCount(): Promise<number> {
  const { data, error } = await supabase.rpc('count_research_excluded_watched');
  if (error) {
    throw new Error(`Failed to fetch research excluded count: ${error.message}`);
  }
  if (typeof data === 'number') return data;
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0];
  return 0;
}

/**
 * Stage 3 の実行モード。
 *
 * - `watch` (default): `watch_settings` 配下のセラピストのみを対象にする。
 *   通知パス (`enqueue_notifications`) も走らせる、本流の運用モード。
 *
 * - `research`: `salons.research_enabled = true` 配下のセラピストのうち
 *   **watch_settings に登録されていない** ものだけを対象にする。
 *   人気指標計測 / 検証用。通知パスはスキップする。
 *   watch 側と対象がオーバーラップしないため、毎分実行の watch 側差分検知を
 *   15 分間隔の research が奪ってしまう事故 (false→true 遷移を取りこぼす等) が起きない。
 *   1 ジョブの所要時間が長くなりやすく watch 側のリアルタイム性を阻害するため、
 *   別 Lambda・別 Schedule で動かす前提。
 */
export type AvailabilityMode = 'watch' | 'research';

async function fetchTargetTherapists(mode: AvailabilityMode): Promise<{
  therapists: TargetTherapist[];
  watchedCount: number;
  researchOnlyCount: number;
  researchExcludedWatchedCount: number;
}> {
  if (mode === 'watch') {
    const rows = await fetchWatchedTherapistRows();
    const therapists = rows.map<TargetTherapist>((row) => ({
      ...toTherapist(row),
      is_watched: true,
    }));
    return {
      therapists,
      watchedCount: therapists.length,
      researchOnlyCount: 0,
      researchExcludedWatchedCount: 0,
    };
  }

  // mode === 'research'
  // research_enabled サロン配下のセラピストのうち、watch_settings に登録されているものは
  // RPC 側で除外済み (= NOT EXISTS で弾いたあとの行のみが返る)。
  // 監視対象セラピストの availability は毎分実行の watch 側 Lambda が責任を持つ:
  //   - そちらの方が頻度が高いので research で先に更新する意味がない
  //   - upsert_availability は previous_is_available を毎回上書きするので、
  //     research が先回りすると watch 側 enqueue_notifications の candidates
  //     (previous_is_available is false / first_seen_at = updated_at) を奪ってしまう
  const [rows, excluded] = await Promise.all([
    fetchResearchTherapistRows(),
    fetchResearchExcludedWatchedCount(),
  ]);
  const therapists = rows.map<TargetTherapist>((row) => ({
    ...toTherapist(row),
    is_watched: false,
  }));
  return {
    therapists,
    watchedCount: 0,
    researchOnlyCount: therapists.length,
    researchExcludedWatchedCount: excluded,
  };
}

async function upsertAvailability(
  therapist: Therapist,
  records: AvailabilityRecord[],
  observedDates: string[],
): Promise<void> {
  // 旧実装は「records=0 && observedDates=0」のとき RPC 呼び出しごと skip していたが、
  // 20260524000002_upsert_availability_marks_synced.sql 以降は RPC 内部で
  // therapists.last_synced_at を併せて更新するため、必ず呼ぶ必要がある。
  // 入力が空でも RPC は no-op + last_synced_at 更新のみで安全に動く。
  const { error } = await supabase.rpc('upsert_availability', {
    p_therapist_id: therapist.id,
    p_rows: records,
    // 空配列は migration 側で「観測範囲なし」と同一視するが、明示的に null を渡せば
    // 旧挙動 (upsert のみ / 消失検知なし) に戻せる。
    p_observed_dates: observedDates.length > 0 ? observedDates : null,
  });
  if (error) {
    throw new Error(`upsert_availability RPC failed: ${error.message}`);
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

  /**
   * 実行モード。省略時は `watch` (本流)。
   * `research` は salons.research_enabled = true 配下のセラピストのみを回し、
   * 通知パスは走らせない。詳細は AvailabilityMode のコメントを参照。
   */
  mode?: AvailabilityMode;

  /**
   * 対象サイトを限定する。複数指定可。
   *
   * 利用例: eyoyaku のような Bot 検知が厳しいサイトを別 Schedule で
   * ゆっくり (5 分間隔など) 巡回するために、メインの 1 分 schedule から分離する。
   *
   * 未指定なら全サイト対象。
   */
  onlySites?: ReadonlyArray<SiteName>;

  /**
   * 対象サイトから特定サイトを除外する。複数指定可。
   * onlySites と併用された場合は onlySites が優先される (excludeSites は無視)。
   */
  excludeSites?: ReadonlyArray<SiteName>;
}

type SiteSummary = {
  therapists: number;
  watched: number;
  research: number;
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
  const mode: AvailabilityMode = opts.mode ?? 'watch';
  const concurrency = Math.max(1, opts.concurrency ?? env.AVAILABILITY_CONCURRENCY);

  const onlySites = opts.onlySites && opts.onlySites.length > 0
    ? new Set<SiteName>(opts.onlySites)
    : undefined;
  const excludeSites = !onlySites && opts.excludeSites && opts.excludeSites.length > 0
    ? new Set<SiteName>(opts.excludeSites)
    : undefined;

  const fetched = await fetchTargetTherapists(mode);
  // サイトフィルタはメモリ上で適用。watch / research のクロスフィルタは fetch 側に
  // 残し、site フィルタはここで一括処理することで両モードで同じロジックを共有する。
  const therapists = fetched.therapists.filter((t) => {
    if (onlySites && onlySites.size > 0 && !onlySites.has(t.site_name)) return false;
    if (excludeSites && excludeSites.has(t.site_name)) return false;
    return true;
  });
  const { watchedCount, researchOnlyCount, researchExcludedWatchedCount } = fetched;

  // サイト別の事前カウントは負荷見積もりに便利なので最初にログる。
  // research 由来の分は研究目的サロンの検証にも使うため別カウントしておく。
  const bySite: Record<string, { total: number; watched: number; research: number }> = {};
  for (const t of therapists) {
    const s = (bySite[t.site_name] ??= { total: 0, watched: 0, research: 0 });
    s.total += 1;
    if (t.is_watched) s.watched += 1;
    else s.research += 1;
  }
  log.info(`Found ${therapists.length} target therapist(s)`, {
    mode,
    concurrency,
    watched: watchedCount,
    researchOnly: researchOnlyCount,
    // research モードで watch_settings 配下と被って除外した件数。
    // 0 が期待値。継続的に非 0 ならフラグの付け方が watch ユーザと競合しているサイン。
    researchExcludedWatched: researchExcludedWatchedCount,
    onlySites: onlySites ? Array.from(onlySites) : undefined,
    excludeSites: excludeSites ? Array.from(excludeSites) : undefined,
    bySite,
  });

  const httpBefore = snapshotHttpMetrics();
  const jobStarted = Date.now();

  const siteSummary = new Map<string, SiteSummary>();
  function bumpSite(site: string, patch: Partial<SiteSummary>): void {
    let s = siteSummary.get(site);
    if (!s) {
      s = {
        therapists: 0,
        watched: 0,
        research: 0,
        success: 0,
        failure: 0,
        slots: 0,
        elapsedMs: 0,
        maxElapsedMs: 0,
      };
      siteSummary.set(site, s);
    }
    if (patch.therapists !== undefined) s.therapists += patch.therapists;
    if (patch.watched !== undefined) s.watched += patch.watched;
    if (patch.research !== undefined) s.research += patch.research;
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
  let circuitSkipped = 0;
  // サイト単位で「ブレーカ OPEN」になったら、その worker 全体で当該サイトの
  // 残ターゲットを以後スキップする (= 並列 worker から共有される)。
  // 他サイトには波及させない (例: eyoyaku が落ちても caskan/grow は継続)。
  const trippedSites = new Set<SiteName>();

  await runWithConcurrency(therapists, concurrency, async (therapist) => {
    if (trippedSites.has(therapist.site_name)) {
      // 既にブレーカ OPEN したサイトの残ターゲット。
      circuitSkipped += 1;
      return;
    }
    const scraper = pickScraper(therapist.site_name);
    const startedAt = Date.now();
    bumpSite(therapist.site_name, {
      therapists: 1,
      watched: therapist.is_watched ? 1 : 0,
      research: therapist.is_watched ? 0 : 1,
    });
    try {
      const result = await scraper.run(therapist);
      const { records, observedDates } = result;
      // upsert_availability は「records=0 && observedDates=0」のときも呼ぶ。
      // RPC 内部で:
      //   1. records ベースの upsert (records=0 なら no-op)
      //   2. observedDates ベースの「消失検知 → closed」(observedDates=0 なら no-op)
      //      estama 等で全枠が ─ になったときに既存 true 行を false にクローズするため。
      //   3. therapists.last_synced_at の更新 (旧 markTherapistSynced を吸収)
      // を同一トランザクションでこなす。
      await upsertAvailability(therapist, records, observedDates);
      // 0 件でも初回同期済みにする（初回だけ枠ゼロのときに永久に Path B が解禁されないように）。
      // research 由来 (is_watched=false) は watch_settings を持たないことが fetchTargetTherapists
      // で保証されており、watch_settings 側の baseline 更新は不要。
      if (therapist.is_watched) {
        await markFirstAvailabilitySyncedIfNeeded(therapist.id);
      }
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
        observedDays: observedDates.length,
        ms: elapsed,
      });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      if (isCircuitBreakerError(err)) {
        trippedSites.add(therapist.site_name);
        failure += 1;
        bumpSite(therapist.site_name, { failure: 1, elapsedMs: elapsed });
        log.error('Site-wide circuit breaker tripped; skipping remaining therapists for this site', {
          site: therapist.site_name,
          therapist: therapist.name,
          cooldown_until: err.cooldownUntil.toISOString(),
          reason: err.reason,
          ms: elapsed,
        });
        return;
      }
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
    watched: number;
    research: number;
    success: number;
    failure: number;
    slots: number;
    avgMs: number;
    maxMs: number;
  }> = {};
  for (const [site, s] of siteSummary.entries()) {
    siteReport[site] = {
      therapists: s.therapists,
      watched: s.watched,
      research: s.research,
      success: s.success,
      failure: s.failure,
      slots: s.slots,
      avgMs: s.therapists > 0 ? Math.round(s.elapsedMs / s.therapists) : 0,
      maxMs: s.maxElapsedMs,
    };
  }

  // research モードは fetchTargetTherapists で watch_settings 配下を除外済み。
  // 対象セラピストに watch が存在しないため enqueue_notifications を呼んでも
  // 必ずヒット 0 件になる + 無駄な RPC コストになるので明示的にスキップする。
  let notified = 0;
  if (mode === 'watch' && success > 0) {
    try {
      notified = await enqueueNotifications();
    } catch (err) {
      log.error('Failed to enqueue notifications', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info('Stage 3 complete', {
    mode,
    therapists: therapists.length,
    watched: watchedCount,
    researchOnly: researchOnlyCount,
    researchExcludedWatched: researchExcludedWatchedCount,
    success,
    failure,
    softDeleted,
    circuitSkipped,
    trippedSites: Array.from(trippedSites),
    slots: totalSlots,
    notified,
    elapsedMs: jobElapsedMs,
    concurrency,
    bySite: siteReport,
    http: formatHttpMetricsLine(httpDiff),
  });
  // CloudWatch metric の job 軸をモードごとに分け、ダッシュボードで watch / research の
  // duration や対象件数を別系列として可視化できるようにする。
  // recordsProcessed は watch では通知件数、research では同期した枠の総数を使う
  // (research は通知 0 が正常なため、別の意味のあるカウンタを採用する)。
  const metricsJob: 'availability' | 'availability_research' =
    mode === 'research' ? 'availability_research' : 'availability';
  emitJobMetrics(metricsJob, {
    durationMs: jobElapsedMs,
    recordsProcessed: mode === 'research' ? totalSlots : notified,
  });
}
