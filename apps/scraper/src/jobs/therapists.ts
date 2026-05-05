import type { Salon, SiteName, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { caskanTherapistScraper } from '../scrapers/caskan/therapists.js';
import { growTherapistScraper } from '../scrapers/grow/therapists.js';

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
  }
}

function unwrapSiteName(sites: SalonRow['sites']): SiteName | null {
  if (!sites) return null;
  if (Array.isArray(sites)) return sites[0]?.name ?? null;
  return sites.name;
}

async function fetchSalons(): Promise<Salon[]> {
  const { data, error } = await supabase
    .from('salons')
    .select('id, site_id, shop_id, name, url, sites!inner(name), last_synced_at, deleted_at')
    .is('deleted_at', null)
    .order('last_synced_at', { ascending: true, nullsFirst: true });

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

export async function runTherapistsJob(): Promise<void> {
  const salons = await fetchSalons();
  log.info(`Found ${salons.length} salons to sync`);

  let success = 0;
  let failure = 0;

  for (const salon of salons) {
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
      failure += 1;
      log.error(`Failed to sync salon`, {
        site: salon.site_name,
        salon: salon.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info(`Stage 2 complete`, { success, failure, total: salons.length });
}
