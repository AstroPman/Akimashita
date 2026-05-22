import type { Salon, SiteName, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { emitJobMetrics } from '../lib/metrics.js';
import { isCircuitBreakerError, isGonePageError } from '../lib/http.js';
import { caskanTherapistScraper } from '../scrapers/caskan/therapists.js';
import { growTherapistScraper } from '../scrapers/grow/therapists.js';
import { edcTherapistScraper } from '../scrapers/edc/therapists.js';
import { estamaTherapistScraper } from '../scrapers/estama/therapists.js';
import { eyoyakuTherapistScraper } from '../scrapers/eyoyaku/therapists.js';

const log = createLogger('job:therapists');

interface SalonRow {
  id: string;
  site_id: string;
  shop_id: string;
  name: string;
  url: string | null;
  sites: { name: SiteName } | { name: SiteName }[] | null;
}

function pickScraper(siteName: SiteName): TherapistScraper {
  switch (siteName) {
    case 'caskan':
      return caskanTherapistScraper;
    case 'grow':
      return growTherapistScraper;
    case 'edc':
      return edcTherapistScraper;
    case 'estama':
      return estamaTherapistScraper;
    case 'eyoyaku':
      return eyoyakuTherapistScraper;
  }
}

function unwrapSiteName(sites: SalonRow['sites']): SiteName | null {
  if (!sites) return null;
  if (Array.isArray(sites)) return sites[0]?.name ?? null;
  return sites.name;
}

async function fetchSalons(opts: {
  onlyUnsynced: boolean;
  onlySites?: ReadonlySet<SiteName>;
  excludeSites?: ReadonlySet<SiteName>;
}): Promise<Salon[]> {
  let query = supabase
    .from('salons')
    .select('id, site_id, shop_id, name, url, sites!inner(name), last_synced_at, deleted_at')
    .is('deleted_at', null)
    .order('last_synced_at', { ascending: true, nullsFirst: true });

  if (opts.onlyUnsynced) {
    query = query.is('last_synced_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch salons: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as (SalonRow & { last_synced_at: string | null })[];
  const salons: Salon[] = [];

  for (const row of rows) {
    const siteName = unwrapSiteName(row.sites);
    if (!siteName) {
      log.warn('Skip salon without site name', { id: row.id, shop_id: row.shop_id });
      continue;
    }
    if (opts.onlySites && opts.onlySites.size > 0 && !opts.onlySites.has(siteName)) continue;
    if (opts.excludeSites && opts.excludeSites.has(siteName)) continue;
    salons.push({
      id: row.id,
      site_id: row.site_id,
      site_name: siteName,
      shop_id: row.shop_id,
      name: row.name,
      url: row.url,
    });
  }

  return salons;
}

async function upsertTherapists(salon: Salon, records: TherapistRecord[]): Promise<void> {
  if (records.length === 0) {
    log.warn('No therapists to upsert', { salon: salon.name });
    return;
  }

  const now = new Date().toISOString();
  const rows = records.map((r) => ({
    salon_id: salon.id,
    therapist_id: r.therapist_id,
    name: r.name,
    profile_url: r.profile_url ?? null,
    image_url: r.image_url ?? null,
    description: r.description ?? null,
    age: r.age ?? null,
    height: r.height ?? null,
    bust: r.bust ?? null,
    waist: r.waist ?? null,
    hip: r.hip ?? null,
    cup: r.cup ?? null,
    last_synced_at: now,
  }));

  const { error } = await supabase
    .from('therapists')
    .upsert(rows, { onConflict: 'salon_id,therapist_id' });

  if (error) {
    throw new Error(`Failed to upsert therapists: ${error.message}`);
  }
}

async function markSalonSynced(salonId: string): Promise<void> {
  const { error } = await supabase
    .from('salons')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', salonId);
  if (error) {
    throw new Error(`Failed to update salons.last_synced_at: ${error.message}`);
  }
}

/**
 * セラピスト一覧ページが恒久的に消えた (404/410) ケースで salon ごと論理削除する。
 *
 * - `salons.deleted_at` を打つ: 次回以降の Stage 2 / Stage 3 取得対象から外れる。
 * - 配下 `therapists` も deleted_at を打つ: Stage 3 (availability) は
 *   `salons.deleted_at` を直接見ないため、ここで明示的に閉じておかないと
 *   watch_settings に残った監視が空クロールを続けてしまう。
 * - `external_salons` / `external_salon_bookings` は意図的に触らない:
 *   実店舗の閉店ではなく単に「この予約サイトでの運用をやめた」可能性があり、
 *   men-esthe.jp 経由で別サイトに移行している場合は external 側のリッチ情報を
 *   保持したまま将来の再リンクに使いたい。
 */
async function softDeleteMissingSalon(salon: Salon): Promise<void> {
  const now = new Date().toISOString();

  const { error: tErr } = await supabase
    .from('therapists')
    .update({ deleted_at: now })
    .eq('salon_id', salon.id)
    .is('deleted_at', null);
  if (tErr) {
    throw new Error(`Failed to soft-delete therapists for missing salon: ${tErr.message}`);
  }

  const { error: sErr } = await supabase
    .from('salons')
    .update({ deleted_at: now })
    .eq('id', salon.id);
  if (sErr) {
    throw new Error(`Failed to soft-delete salons: ${sErr.message}`);
  }
}

export interface RunTherapistsJobOptions {
  /** true の場合、last_synced_at IS NULL のサロン（未スクレイピング）のみを対象にする。 */
  onlyUnsynced?: boolean;
  /**
   * 対象サイトを限定する。複数指定可。
   *
   * 利用例:
   * - eyoyaku のような Bot 検知が厳しいサイトを別 Lambda Schedule で
   *   ゆっくり巡回したいときに、メインのジョブから除外する。
   * - 新規追加サイトの初回ブートストラップを単独で動かす。
   *
   * 未指定 (undefined / 空) なら全サイト対象。
   */
  onlySites?: ReadonlyArray<SiteName>;
  /**
   * 対象サイトから特定サイトを除外する。複数指定可。
   * onlySites と併用された場合は onlySites が優先される (excludeSites は無視)。
   */
  excludeSites?: ReadonlyArray<SiteName>;
  /**
   * 1 ジョブで site あたりに処理する最大サロン数。
   *
   * 例: eyoyaku の初回 131 サロンを 1 度に全部叩くと WAF を踏むため、
   * `maxPerSite: 20` のように分割して数日に分けて完走させる。
   * `last_synced_at` は ascending + nullsFirst 順なので、未同期 → 古い順 に
   * 自然に巡回される (= 飢餓状態のサロンが優先的に追いつく)。
   *
   * 未指定なら制限なし。
   */
  maxPerSite?: number;
}

export async function runTherapistsJob(
  options: RunTherapistsJobOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  const onlyUnsynced = options.onlyUnsynced ?? false;
  const onlySites = options.onlySites && options.onlySites.length > 0
    ? new Set<SiteName>(options.onlySites)
    : undefined;
  const excludeSites = !onlySites && options.excludeSites && options.excludeSites.length > 0
    ? new Set<SiteName>(options.excludeSites)
    : undefined;
  const maxPerSite = options.maxPerSite && options.maxPerSite > 0 ? options.maxPerSite : null;

  const rawSalons = await fetchSalons({ onlyUnsynced, onlySites, excludeSites });

  // maxPerSite を適用 (site ごとに ascending nullsFirst の先頭 N 件)。
  let salons = rawSalons;
  if (maxPerSite !== null) {
    const perSite = new Map<SiteName, number>();
    salons = rawSalons.filter((s) => {
      const used = perSite.get(s.site_name) ?? 0;
      if (used >= maxPerSite) return false;
      perSite.set(s.site_name, used + 1);
      return true;
    });
  }

  log.info(`Found ${salons.length} salons to sync`, {
    only_unsynced: onlyUnsynced,
    only_sites: onlySites ? Array.from(onlySites) : undefined,
    exclude_sites: excludeSites ? Array.from(excludeSites) : undefined,
    max_per_site: maxPerSite,
    total_before_limit: rawSalons.length,
  });

  let success = 0;
  let failure = 0;
  let softDeleted = 0;
  // サイト単位でブレーカが OPEN したらそのサイトの残サロンはスキップ。
  // 他サイトには波及させない (例: eyoyaku が落ちても caskan は継続)。
  const tripped = new Set<SiteName>();

  for (const salon of salons) {
    if (tripped.has(salon.site_name)) {
      // 既にブレーカが OPEN したサイトの残サロン。
      // 通常パスでも HttpCircuitBreakerError が即 throw されるが、
      // メトリクス / supabase クライアント呼び出しすら走らせずに済むよう手前で弾く。
      continue;
    }
    const scraper = pickScraper(salon.site_name);
    try {
      const records = await scraper.run(salon);
      await upsertTherapists(salon, records);
      await markSalonSynced(salon.id);
      success += 1;
      log.info(`Synced salon`, {
        site: salon.site_name,
        salon: salon.name,
        count: records.length,
      });
    } catch (err) {
      if (isCircuitBreakerError(err)) {
        tripped.add(salon.site_name);
        log.error('Site-wide circuit breaker tripped; skipping remaining salons for this site', {
          site: salon.site_name,
          cooldown_until: err.cooldownUntil.toISOString(),
          reason: err.reason,
        });
        failure += 1;
        continue;
      }
      if (isGonePageError(err)) {
        try {
          await softDeleteMissingSalon(salon);
          softDeleted += 1;
          log.warn('Soft-deleted salon: page gone (404/410)', {
            site: salon.site_name,
            salon: salon.name,
            salon_id: salon.id,
            shop_id: salon.shop_id,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        } catch (cleanupErr) {
          log.error('Failed to soft-delete missing salon', {
            site: salon.site_name,
            salon: salon.name,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }
      failure += 1;
      log.error(`Failed to sync salon`, {
        site: salon.site_name,
        salon: salon.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info(`Stage 2 complete`, {
    success,
    failure,
    softDeleted,
    total: salons.length,
    tripped_sites: Array.from(tripped),
  });
  emitJobMetrics('therapists', {
    durationMs: Date.now() - startedAt,
    recordsProcessed: success,
  });
}
