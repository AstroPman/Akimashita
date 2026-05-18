import type {
  ExternalSalonBooking,
  ExternalSalonListEntry,
  ExternalSalonRecord,
  ExternalTherapistRecord,
} from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { env } from '../lib/env.js';
import { createLogger } from '../lib/logger.js';
import { emitJobMetrics } from '../lib/metrics.js';
import { fetchAreaList } from '../scrapers/menesthe/area_list.js';
import { fetchAreaSalons } from '../scrapers/menesthe/area_salons.js';
import { fetchSalonDetail } from '../scrapers/menesthe/salon_detail.js';
import {
  resolveHomepage,
  shouldSoftDeleteExternalSalonForHomepageFailure,
} from '../scrapers/menesthe/homepage_resolver.js';
import { fetchExternalTherapists } from '../scrapers/menesthe/therapist_list.js';

const log = createLogger('job:external_salons');

const SOURCE = 'menesthe';

export type ExternalSalonsPhase =
  | 'areas'
  | 'discover'
  | 'details'
  | 'bookings'
  | 'therapists'
  | 'link'
  | 'all';

export interface RunExternalSalonsJobOptions {
  /** 実行フェーズ。未指定なら 'all' (areas → discover → details → bookings)。 */
  phase?: ExternalSalonsPhase;
  /** details / bookings 各フェーズで処理する最大件数。Lambda 1 回分の予算管理用。 */
  limit?: number;
  /** 詳細を再取得するしきい値 (日数)。details_synced_at < now - N days を対象に含める。 */
  staleAfterDays?: number;
  /** ジョブ全体の予算 (ms)。これを超えたフェーズは早期終了。デフォルト 13 分 (Lambda 15 分 - 2 分マージン)。 */
  budgetMs?: number;
}

interface DbExternalArea {
  id: string;
  source_id: string;
  prefecture: string | null;
}

interface DbExternalSalon {
  id: string;
  source_id: string;
  homepage_url: string | null;
}

export async function runExternalSalonsJob(
  options: RunExternalSalonsJobOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  const phase = options.phase ?? 'all';
  const limit = options.limit ?? 200;
  const staleAfterDays = options.staleAfterDays ?? 30;
  const budgetMs = options.budgetMs ?? 13 * 60 * 1000;
  const deadlineAt = startedAt + budgetMs;
  const overBudget = () => Date.now() > deadlineAt;

  log.info('Starting external_salons job', { phase, limit, stale_after_days: staleAfterDays });

  // 各 phase の成果件数（recordsProcessed）を合算する。phase 単独実行のときは
  // 対応する phase 分のみが加算されるので、Lambda 1 呼び出し = 1 phase の場合は
  // その phase の成果件数がそのまま CloudWatch メトリクスに記録される。
  let recordsProcessed = 0;

  if (phase === 'areas' || phase === 'all') {
    recordsProcessed += await syncAreas();
  }

  if (phase === 'discover' || phase === 'all') {
    if (overBudget()) {
      log.warn('Budget exhausted before discover phase, skipping');
    } else {
      recordsProcessed += await discoverSalonsByArea({ deadlineAt });
    }
  }

  if (phase === 'details' || phase === 'all') {
    if (overBudget()) {
      log.warn('Budget exhausted before details phase, skipping');
    } else {
      recordsProcessed += await syncSalonDetails({ limit, staleAfterDays, deadlineAt });
    }
  }

  if (phase === 'bookings' || phase === 'all') {
    if (overBudget()) {
      log.warn('Budget exhausted before bookings phase, skipping');
    } else {
      recordsProcessed += await resolveBookings({ limit, staleAfterDays, deadlineAt });
    }
  }

  if (phase === 'therapists' || phase === 'all') {
    if (overBudget()) {
      log.warn('Budget exhausted before therapists phase, skipping');
    } else {
      recordsProcessed += await syncExternalTherapists({ limit, staleAfterDays, deadlineAt });
    }
  }

  if (phase === 'link' || phase === 'all') {
    if (overBudget()) {
      log.warn('Budget exhausted before link phase, skipping');
    } else {
      recordsProcessed += await linkSalonsToExternal();
    }
  }

  log.info('Finished external_salons job');
  emitJobMetrics('salons', {
    durationMs: Date.now() - startedAt,
    recordsProcessed,
  });
}


// ============================================================
// Phase 1: areas
// ============================================================

async function syncAreas(): Promise<number> {
  const areas = await fetchAreaList();
  if (areas.length === 0) {
    log.warn('No areas parsed');
    return 0;
  }

  const rows = areas.map((a) => ({
    source: SOURCE,
    source_id: a.source_id,
    name: a.name,
    district: a.district,
    prefecture: a.prefecture,
    source_url: a.source_url,
  }));

  const { error } = await supabase
    .from('external_areas')
    .upsert(rows, { onConflict: 'source,source_id' });
  if (error) {
    throw new Error(`Failed to upsert external_areas: ${error.message}`);
  }
  log.info(`Upserted ${rows.length} external_areas`);
  return rows.length;
}


// ============================================================
// Phase 2: discover (エリア一覧から shell record を作る)
// ============================================================

async function discoverSalonsByArea(ctx: { deadlineAt: number }): Promise<number> {
  const areas = await fetchAllExternalAreas();
  log.info(`Discovering salons across ${areas.length} areas`);

  let totalSeen = 0;
  let totalNew = 0;

  for (const area of areas) {
    if (Date.now() > ctx.deadlineAt) {
      log.warn('Budget exhausted during discover phase', {
        processed_areas: areas.indexOf(area),
        total_areas: areas.length,
      });
      break;
    }
    try {
      const entries = await fetchAreaSalons(area.source_id);
      totalSeen += entries.length;
      const newly = await upsertSalonShells(entries);
      totalNew += newly;
    } catch (err) {
      log.warn('Failed to discover salons for area', {
        area_id: area.source_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info('Discover phase done', { total_seen: totalSeen, total_new_or_updated: totalNew });
  return totalNew;
}

async function fetchAllExternalAreas(): Promise<DbExternalArea[]> {
  const { data, error } = await supabase
    .from('external_areas')
    .select('id, source_id, prefecture')
    .eq('source', SOURCE);
  if (error) {
    throw new Error(`Failed to fetch external_areas: ${error.message}`);
  }
  return (data ?? []) as DbExternalArea[];
}

async function upsertSalonShells(entries: ExternalSalonListEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  // 詳細未取得の場合、area discover で得られる name のみで shell を作る。
  // 既存行に対しては name と source_url の上書きに留まり、details_synced_at は触らない。
  const rows = entries.map((e) => ({
    source: SOURCE,
    source_id: e.source_id,
    name: e.name,
    source_url: e.source_url,
  }));
  const { error } = await supabase
    .from('external_salons')
    .upsert(rows, { onConflict: 'source,source_id', ignoreDuplicates: false });
  if (error) {
    throw new Error(`Failed to upsert external_salons shells: ${error.message}`);
  }
  return rows.length;
}


// ============================================================
// Phase 3: details (salon.php?id=X を fetch して 詳細を埋める)
// ============================================================

async function syncSalonDetails(ctx: {
  limit: number;
  staleAfterDays: number;
  deadlineAt: number;
}): Promise<number> {
  const candidates = await fetchSalonsForDetailRefresh(ctx.limit, ctx.staleAfterDays);
  log.info(`Detail refresh: ${candidates.length} salons`);

  const prefectureByAreaId = await buildPrefectureIndex();

  let success = 0;
  let failure = 0;
  let missing = 0;
  let closed = 0;

  for (const row of candidates) {
    if (Date.now() > ctx.deadlineAt) {
      log.warn('Budget exhausted during details phase', { processed: success + failure });
      break;
    }
    try {
      const detail = await fetchSalonDetail(row.source_id);
      if (!detail) {
        missing += 1;
        await markSalonMissing(row.id);
        continue;
      }
      if (detail.kind === 'closed') {
        closed += 1;
        await markSalonClosed(row.id);
        continue;
      }
      const prefecture = pickPrimaryPrefecture(detail.record.area_source_ids, prefectureByAreaId);
      await updateSalonDetail(row.id, detail.record, prefecture);
      success += 1;
    } catch (err) {
      failure += 1;
      log.warn('Detail fetch failed', {
        source_id: row.source_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  log.info('Details phase done', { success, failure, missing, closed });
  return success;
}

async function fetchSalonsForDetailRefresh(limit: number, staleAfterDays: number): Promise<DbExternalSalon[]> {
  const stale = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();
  // details_synced_at IS NULL OR details_synced_at < stale を対象にする。
  // .or() で OR 条件を組み立てる。
  const { data, error } = await supabase
    .from('external_salons')
    .select('id, source_id, homepage_url')
    .eq('source', SOURCE)
    .is('deleted_at', null)
    .or(`details_synced_at.is.null,details_synced_at.lt.${stale}`)
    .order('details_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to fetch external_salons for detail refresh: ${error.message}`);
  }
  return (data ?? []) as DbExternalSalon[];
}

async function buildPrefectureIndex(): Promise<Map<string, string>> {
  const areas = await fetchAllExternalAreas();
  const map = new Map<string, string>();
  for (const a of areas) {
    if (a.prefecture) map.set(a.source_id, a.prefecture);
  }
  return map;
}

function pickPrimaryPrefecture(
  areaSourceIds: string[],
  prefectureByAreaId: Map<string, string>,
): string | null {
  // 最初に prefecture が解決できたエリアを採用 (パンくず先頭が主エリアの想定)。
  for (const id of areaSourceIds) {
    const p = prefectureByAreaId.get(id);
    if (p) return p;
  }
  return null;
}

async function updateSalonDetail(
  rowId: string,
  detail: ExternalSalonRecord,
  prefecture: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('external_salons')
    .update({
      name: detail.name,
      prefecture,
      areas: detail.areas,
      area_source_ids: detail.area_source_ids,
      nearest_stations: detail.nearest_stations,
      genre: detail.genre,
      price_range: detail.price_range,
      opening_hours: detail.opening_hours,
      homepage_url: detail.homepage_url,
      source_url: detail.source_url,
      details_synced_at: now,
      // 詳細を更新したら bookings は再評価したい (URL が変わった可能性) ので
      // bookings_synced_at は意図的にリセットする。
      bookings_synced_at: null,
      // 復活したサロンへの対応: deleted_at をクリアする。
      deleted_at: null,
    })
    .eq('id', rowId);
  if (error) {
    throw new Error(`Failed to update external_salons detail: ${error.message}`);
  }
}

async function markSalonMissing(rowId: string): Promise<void> {
  // canonical 不一致 / 404 の場合、論理削除して再取得を抑制する。
  await cleanupExternalSalonReferences(rowId);
  await softDeleteExternalSalon(rowId);
}

async function markSalonClosed(rowId: string): Promise<void> {
  // ページ上で `.closeIcon` (閉店バナー) が検出された場合、論理削除して
  // 以降の details / bookings / link 対象から外す。
  // details_synced_at を進めることで staleAfterDays の再評価まで再取得を抑制する。
  // 万一閉店が解除されてしきい値で再取得された場合は parseSalonDetail が
  // `kind: 'detail'` を返し、updateSalonDetail 側で deleted_at が null クリアされて自然復活する。
  await cleanupExternalSalonReferences(rowId);
  await softDeleteExternalSalon(rowId);
}

/**
 * 閉店 / 行方不明として論理削除される `external_salons` に紐づく依存データを整理する。
 *
 * - `external_salon_bookings`: 外部キーは `on delete cascade` だが、こちらは論理削除なので
 *   cascade が走らない。閉店した外部サロンの予約システムリンクは保持する意味がないので物理削除する。
 *   `link_salons_to_external()` 再実行時に閉店サロンが候補として残らないようにする狙いも兼ねる。
 * - `salons.external_salon_id`: 外部キーは `on delete set null` だが、こちらも論理削除では
 *   発火しないため、明示的に null クリアする。閉店した外部サロンへの参照を残さない。
 *
 * `external_salons.deleted_at` を打つよりも先に依存側を片付けることで、途中失敗時に
 * 「論理削除済みだが bookings 行は残っている」状態を作らない（次回も再試行されるまま）。
 */
async function cleanupExternalSalonReferences(externalSalonId: string): Promise<void> {
  const { error: bookingsErr } = await supabase
    .from('external_salon_bookings')
    .delete()
    .eq('external_salon_id', externalSalonId);
  if (bookingsErr) {
    throw new Error(`Failed to delete external_salon_bookings on soft-delete: ${bookingsErr.message}`);
  }

  const { error: salonsErr } = await supabase
    .from('salons')
    .update({ external_salon_id: null })
    .eq('external_salon_id', externalSalonId);
  if (salonsErr) {
    throw new Error(`Failed to detach salons.external_salon_id on soft-delete: ${salonsErr.message}`);
  }
}

async function softDeleteExternalSalon(rowId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('external_salons')
    .update({ deleted_at: now, details_synced_at: now })
    .eq('id', rowId);
  if (error) {
    throw new Error(`Failed to soft-delete external_salons: ${error.message}`);
  }
}


// ============================================================
// Phase 4: bookings (homepage_url を訪問して予約URL を抽出)
// ============================================================

interface BookingCounters {
  success: number;
  failure: number;
  softDeleted: number;
}

async function resolveBookings(ctx: {
  limit: number;
  staleAfterDays: number;
  deadlineAt: number;
}): Promise<number> {
  const targets = await fetchSalonsForBookingRefresh(ctx.limit, ctx.staleAfterDays);
  log.info(`Booking resolve: ${targets.length} salons`);

  // homepage_url は基本サロンごとに別ホストなので、worker pool で並列化する。
  // 同一ホストに偶然重なっても http.ts の HostQueue が host 単位で直列化してくれるため、
  // 並列度を上げてもポータルに対する礼儀作法 (ランダム遅延 / リトライ) は維持される。
  const concurrency = Math.max(1, env.BOOKING_CONCURRENCY);
  const workerCount = Math.min(concurrency, Math.max(1, targets.length));
  const counters: BookingCounters = { success: 0, failure: 0, softDeleted: 0 };

  // 共有カーソルから先着順で 1 件ずつ取り出す。budget 超過 / 全件完了で worker は終了。
  // Node.js はシングルスレッドなので cursor++ は atomic に動く。
  let cursor = 0;
  let budgetExhausted = false;

  async function worker(): Promise<void> {
    while (true) {
      if (Date.now() > ctx.deadlineAt) {
        budgetExhausted = true;
        return;
      }
      const idx = cursor++;
      if (idx >= targets.length) return;
      const row = targets[idx];
      if (!row?.homepage_url) continue;
      await processBookingTarget(row, counters);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (budgetExhausted) {
    log.warn('Budget exhausted during bookings phase', {
      processed: counters.success + counters.failure + counters.softDeleted,
      total: targets.length,
    });
  }
  log.info('Bookings phase done', {
    success: counters.success,
    failure: counters.failure,
    soft_deleted: counters.softDeleted,
    concurrency: workerCount,
  });
  return counters.success;
}

async function processBookingTarget(
  row: DbExternalSalon,
  counters: BookingCounters,
): Promise<void> {
  if (!row.homepage_url) return;

  const result = await resolveHomepage(row.homepage_url);

  if (!result.ok && shouldSoftDeleteExternalSalonForHomepageFailure(result.reason)) {
    try {
      await cleanupExternalSalonReferences(row.id);
      await softDeleteExternalSalon(row.id);
      counters.softDeleted += 1;
      log.info('Soft-deleted external_salon (homepage gone or invalid)', {
        external_salon_id: row.id,
        source_id: row.source_id,
        reason: result.reason,
      });
    } catch (err) {
      counters.failure += 1;
      log.warn('Soft-delete failed after homepage failure', {
        external_salon_id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  let replaceBookingsCompleted = false;
  try {
    if (result.ok) {
      await replaceBookings(row.id, result.bookings);
      replaceBookingsCompleted = true;
      counters.success += 1;
    } else {
      counters.failure += 1;
    }
    // 取得失敗でも進める: 常に nullsFirst で先頭に張り付くのを防ぐ (stale で再訪)。
    await markBookingsSynced(row.id);
  } catch (err) {
    if (result.ok || replaceBookingsCompleted) {
      counters.failure += 1;
    }
    log.warn('Failed to persist bookings', {
      external_salon_id: row.id,
      error: err instanceof Error ? err.message : String(err),
    });
    // replace 前に落ちた以外は、同期日時を進めて占有を避ける (mark 自体の失敗もリカバリ)。
    if (!result.ok || replaceBookingsCompleted) {
      try {
        await markBookingsSynced(row.id);
      } catch (markErr) {
        log.warn('markBookingsSynced failed after error', {
          external_salon_id: row.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }
  }
}

async function fetchSalonsForBookingRefresh(limit: number, staleAfterDays: number): Promise<DbExternalSalon[]> {
  const stale = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('external_salons')
    .select('id, source_id, homepage_url')
    .eq('source', SOURCE)
    .is('deleted_at', null)
    .not('homepage_url', 'is', null)
    .or(`bookings_synced_at.is.null,bookings_synced_at.lt.${stale}`)
    .order('bookings_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to fetch external_salons for booking refresh: ${error.message}`);
  }
  return (data ?? []) as DbExternalSalon[];
}

async function replaceBookings(externalSalonId: string, bookings: ExternalSalonBooking[]): Promise<void> {
  // 古い検出結果と入れ替える: まず削除してから挿入。
  // booking_url が変わった/減ったケースも反映できる。
  const { error: delErr } = await supabase
    .from('external_salon_bookings')
    .delete()
    .eq('external_salon_id', externalSalonId);
  if (delErr) {
    throw new Error(`Failed to delete external_salon_bookings: ${delErr.message}`);
  }
  if (bookings.length === 0) return;

  const rows = bookings.map((b) => ({
    external_salon_id: externalSalonId,
    site_name: b.site_name,
    shop_id: b.shop_id,
    booking_url: b.booking_url,
  }));
  const { error } = await supabase.from('external_salon_bookings').insert(rows);
  if (error) {
    throw new Error(`Failed to insert external_salon_bookings: ${error.message}`);
  }
}

async function markBookingsSynced(externalSalonId: string): Promise<void> {
  const { error } = await supabase
    .from('external_salons')
    .update({ bookings_synced_at: new Date().toISOString() })
    .eq('id', externalSalonId);
  if (error) {
    throw new Error(`Failed to update bookings_synced_at: ${error.message}`);
  }
}


// ============================================================
// Phase 4.5: therapists (men-esthe.jp の per-salon JSON API でセラピスト一覧を取得)
// ============================================================

interface DbExternalSalonForTherapists {
  id: string;
  source_id: string;
}

interface TherapistsCounters {
  success: number;
  failure: number;
  upserted: number;
  softDeleted: number;
}

async function syncExternalTherapists(ctx: {
  limit: number;
  staleAfterDays: number;
  deadlineAt: number;
}): Promise<number> {
  const targets = await fetchSalonsForTherapistsRefresh(ctx.limit, ctx.staleAfterDays);
  log.info(`Therapist sync: ${targets.length} salons`);

  const counters: TherapistsCounters = { success: 0, failure: 0, upserted: 0, softDeleted: 0 };

  for (const row of targets) {
    if (Date.now() > ctx.deadlineAt) {
      log.warn('Budget exhausted during therapists phase', {
        processed: counters.success + counters.failure,
        total: targets.length,
      });
      break;
    }
    try {
      const records = await fetchExternalTherapists(row.source_id);
      const { upserted, softDeleted } = await replaceExternalTherapistsForSalon(row.id, records);
      counters.upserted += upserted;
      counters.softDeleted += softDeleted;
      counters.success += 1;
    } catch (err) {
      counters.failure += 1;
      log.warn('Failed to sync external therapists', {
        external_salon_id: row.id,
        source_id: row.source_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // 取得失敗でも therapists_synced_at は進める: 同じサロンが nullsFirst で先頭に
    // 張り付くのを防ぐ。次回 stale で再訪する。
    try {
      await markTherapistsSynced(row.id);
    } catch (markErr) {
      log.warn('markTherapistsSynced failed', {
        external_salon_id: row.id,
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
  }

  log.info('Therapists phase done', {
    success: counters.success,
    failure: counters.failure,
    upserted: counters.upserted,
    soft_deleted: counters.softDeleted,
  });
  return counters.upserted;
}

async function fetchSalonsForTherapistsRefresh(
  limit: number,
  staleAfterDays: number,
): Promise<DbExternalSalonForTherapists[]> {
  const stale = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('external_salons')
    .select('id, source_id')
    .eq('source', SOURCE)
    .is('deleted_at', null)
    .or(`therapists_synced_at.is.null,therapists_synced_at.lt.${stale}`)
    .order('therapists_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to fetch external_salons for therapists refresh: ${error.message}`);
  }
  return (data ?? []) as DbExternalSalonForTherapists[];
}

/**
 * external_salon 配下のセラピスト一覧を「丸ごと差し替える」。
 *
 * - 取得した在籍セラピスト (status=1) は upsert + deleted_at=null で復活/更新。
 * - 取得した退店セラピスト (status=2) は upsert 後に deleted_at を打つ
 *   (履歴は残し、UI からは外す)。
 * - 今回の JSON に登場しなかった既存行は「ポータルから消失」とみなし deleted_at を打つ。
 *   後続で復活して JSON に再出現すれば deleted_at がクリアされる。
 *
 * @returns upserted: 取得 JSON 行数、softDeleted: 消失で論理削除した行数
 */
async function replaceExternalTherapistsForSalon(
  externalSalonId: string,
  records: ExternalTherapistRecord[],
): Promise<{ upserted: number; softDeleted: number }> {
  const now = new Date().toISOString();

  // 既存行 (deleted_at の有無を問わず) を全て取り、今回の JSON に無かった分を後で論理削除する。
  const { data: existing, error: selErr } = await supabase
    .from('external_therapists')
    .select('id, source_id, deleted_at')
    .eq('source', SOURCE)
    .eq('external_salon_id', externalSalonId);
  if (selErr) {
    throw new Error(`Failed to fetch existing external_therapists: ${selErr.message}`);
  }
  const existingBySourceId = new Map<string, { id: string; deleted_at: string | null }>(
    (existing ?? []).map((r: { id: string; source_id: string; deleted_at: string | null }) => [
      r.source_id,
      { id: r.id, deleted_at: r.deleted_at },
    ]),
  );

  let upserted = 0;
  let softDeleted = 0;

  if (records.length > 0) {
    const rows = records.map((r) => ({
      source: SOURCE,
      source_id: r.source_id,
      external_salon_id: externalSalonId,
      name: r.name,
      display_name: r.display_name,
      kana: r.kana,
      age: r.age,
      height: r.height,
      cup: r.cup,
      style_raw: r.style_raw,
      image_urls: r.image_urls,
      primary_image_url: r.primary_image_url,
      therapist_url: r.therapist_url,
      comment: r.comment,
      status: r.status,
      source_updated_at: r.source_updated_at,
      source_url: r.source_url,
      // status=2 (退店) は明示的に deleted_at=now を立て、status=1 は復活させる。
      deleted_at: r.status === 2 ? now : null,
    }));

    const { error: upErr } = await supabase
      .from('external_therapists')
      .upsert(rows, { onConflict: 'source,source_id' });
    if (upErr) {
      throw new Error(`Failed to upsert external_therapists: ${upErr.message}`);
    }
    upserted = rows.length;
  }

  // 今回 JSON に出てこなかった既存行を論理削除する (まだ削除済みでないものに限る)。
  const seenSourceIds = new Set(records.map((r) => r.source_id));
  const orphanIds: string[] = [];
  for (const [sourceId, row] of existingBySourceId.entries()) {
    if (seenSourceIds.has(sourceId)) continue;
    if (row.deleted_at) continue;
    orphanIds.push(row.id);
  }
  if (orphanIds.length > 0) {
    const { error: delErr } = await supabase
      .from('external_therapists')
      .update({ deleted_at: now })
      .in('id', orphanIds);
    if (delErr) {
      throw new Error(`Failed to soft-delete missing external_therapists: ${delErr.message}`);
    }
    softDeleted = orphanIds.length;
  }

  return { upserted, softDeleted };
}

async function markTherapistsSynced(externalSalonId: string): Promise<void> {
  const { error } = await supabase
    .from('external_salons')
    .update({ therapists_synced_at: new Date().toISOString() })
    .eq('id', externalSalonId);
  if (error) {
    throw new Error(`Failed to update therapists_synced_at: ${error.message}`);
  }
}


// ============================================================
// Phase 5: link (salons.external_salon_id を埋める)
// ============================================================

async function linkSalonsToExternal(): Promise<number> {
  // 実体は SQL 関数 (link_salons_to_external) に集約してある。
  // service_role からのみ実行可能で、(sites.name, salons.shop_id) と
  // external_salon_bookings の組み合わせから新規リンクを張る。
  const { data, error } = await supabase.rpc('link_salons_to_external');
  if (error) {
    throw new Error(`Failed to link salons to external: ${error.message}`);
  }
  const linkedSalons = typeof data === 'number' ? data : 0;

  // therapists 側のリンクも同じフェーズで張る (A+ URL parse → A name match)。
  // salons リンクが先に走るため、external_salon_id が新規に埋まったサロンも
  // 同じトランザクション境界の中で therapists リンクの対象に入る。
  const { data: therapistData, error: therapistErr } = await supabase.rpc(
    'link_therapists_to_external',
  );
  if (therapistErr) {
    throw new Error(`Failed to link therapists to external: ${therapistErr.message}`);
  }
  const linkedTherapists = typeof therapistData === 'number' ? therapistData : 0;

  log.info('Link phase done', {
    newly_linked_salons: linkedSalons,
    newly_linked_therapists: linkedTherapists,
  });
  return linkedSalons + linkedTherapists;
}
