import type {
  AvailabilityRecord,
  AvailabilityScraper,
  SiteName,
  Therapist,
} from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { caskanAvailabilityScraper } from '../scrapers/caskan/availability.js';
import { growAvailabilityScraper } from '../scrapers/grow/availability.js';
import { edcAvailabilityScraper } from '../scrapers/edc/availability.js';

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
  }
}

function unwrapNested<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

async function fetchWatchedTherapists(): Promise<Therapist[]> {
  // watch_settings に登録されているセラピストのみ重複排除して取得する
  const { data, error } = await supabase
    .from('therapists')
    .select(
      'id, therapist_id, name, salon_id, ' +
        'salons!inner(shop_id, sites!inner(name)), ' +
        'watch_settings!inner(id, is_active, deleted_at)',
    )
    .is('deleted_at', null)
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

export async function runAvailabilityJob(): Promise<void> {
  const therapists = await fetchWatchedTherapists();
  log.info(`Found ${therapists.length} watched therapist(s)`);

  let success = 0;
  let failure = 0;
  let totalSlots = 0;

  for (const therapist of therapists) {
    const scraper = pickScraper(therapist.site_name);
    try {
      const records = await scraper.run(therapist);
      if (records.length > 0) {
        await upsertAvailability(therapist, records);
      }
      // 0 件でも初回同期済みにする（初回だけ枠ゼロのときに永久に Path B が解禁されないように）
      await markFirstAvailabilitySyncedIfNeeded(therapist.id);
      await markTherapistSynced(therapist.id);
      success += 1;
      totalSlots += records.length;
      log.info('Synced therapist', {
        site: therapist.site_name,
        therapist: therapist.name,
        slots: records.length,
      });
    } catch (err) {
      failure += 1;
      log.error('Failed to sync therapist', {
        site: therapist.site_name,
        therapist: therapist.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
    slots: totalSlots,
    notified,
  });
}
