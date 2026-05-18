import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ScraperFreshness {
  external_salons_total: number;
  external_salons_details_never: number;
  external_salons_details_stale: number;
  external_salons_bookings_never: number;
  external_salons_bookings_stale: number;
  external_salons_homepage_missing: number;
  salons_active: number;
  salons_last_synced_never: number;
  salons_last_synced_stale: number;
  therapists_active: number;
  therapists_last_synced_never: number;
  therapists_last_synced_stale: number;
}

export async function fetchScraperFreshness(
  thresholdHours: number,
): Promise<ScraperFreshness> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_scraper_freshness", {
    p_threshold_hours: thresholdHours,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as ScraperFreshness | undefined;
  if (!row) {
    throw new Error("stats_scraper_freshness が結果を返しませんでした");
  }
  return row;
}

export type AvailabilityEventType =
  | "opened"
  | "closed"
  | "discovered_open"
  | "discovered_closed";

export interface AvailabilityEventRow {
  event_type: AvailabilityEventType;
  cnt: number;
}

export async function fetchAvailabilityEventsRecent(
  hours: number,
): Promise<AvailabilityEventRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "stats_availability_events_recent",
    { p_hours: hours },
  );
  if (error) throw error;
  return (data ?? []) as AvailabilityEventRow[];
}

export const EVENT_TYPE_LABEL: Record<AvailabilityEventType, string> = {
  opened: "再オープン",
  closed: "クローズ",
  discovered_open: "新規発見 (開)",
  discovered_closed: "新規発見 (閉)",
};
