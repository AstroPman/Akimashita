import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AvailabilityEventType =
  | "opened"
  | "closed"
  | "discovered_open"
  | "discovered_closed";

export const EVENT_TYPE_VALUES: readonly AvailabilityEventType[] = [
  "opened",
  "closed",
  "discovered_open",
  "discovered_closed",
] as const;

export const EVENT_TYPE_LABEL: Record<AvailabilityEventType, string> = {
  discovered_open: "未発見 → 空き",
  discovered_closed: "未発見 → 埋まり",
  opened: "埋まり → 空き",
  closed: "空き → 埋まり",
};

export const EVENT_TYPE_TONE: Record<
  AvailabilityEventType,
  "default" | "success" | "warning" | "destructive"
> = {
  discovered_open: "success",
  opened: "success",
  discovered_closed: "warning",
  closed: "destructive",
};

export function isAvailabilityEventType(
  value: string | undefined,
): value is AvailabilityEventType {
  return (
    value === "opened" ||
    value === "closed" ||
    value === "discovered_open" ||
    value === "discovered_closed"
  );
}

export interface AvailabilityEventFeedRow {
  occurred_at: string;
  event_type: AvailabilityEventType;
  therapist_id: string;
  therapist_name: string;
  salon_id: string;
  salon_name: string;
  site_name: string;
  slot_date: string;
  start_time: string;
}

export interface AvailabilityEventFeedFilters {
  hours: number;
  limit?: number;
  eventTypes?: AvailabilityEventType[];
  siteId?: string;
  salonId?: string;
  therapistId?: string;
}

export async function fetchAvailabilityEventsFeed(
  filters: AvailabilityEventFeedFilters,
): Promise<AvailabilityEventFeedRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_availability_events_feed", {
    p_hours: filters.hours,
    p_limit: filters.limit ?? 200,
    p_event_types:
      filters.eventTypes && filters.eventTypes.length > 0
        ? filters.eventTypes
        : null,
    p_site_id: filters.siteId ?? null,
    p_salon_id: filters.salonId ?? null,
    p_therapist_id: filters.therapistId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as AvailabilityEventFeedRow[];
}

export interface AvailabilityEventSummaryRow {
  event_type: AvailabilityEventType;
  cnt: number;
}

export async function fetchAvailabilityEventsSummary(
  hours: number,
): Promise<AvailabilityEventSummaryRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "stats_availability_events_recent",
    { p_hours: hours },
  );
  if (error) throw error;
  return (data ?? []) as AvailabilityEventSummaryRow[];
}

export interface StaleOpenOverview {
  total_count: number;
  affected_salon_count: number;
  affected_therapist_count: number;
  oldest_date: string | null;
}

export async function fetchStaleOpenOverview(): Promise<StaleOpenOverview> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_stale_open_slots_overview");
  if (error) throw error;
  const row = (data ?? [])[0] as StaleOpenOverview | undefined;
  if (!row) {
    return {
      total_count: 0,
      affected_salon_count: 0,
      affected_therapist_count: 0,
      oldest_date: null,
    };
  }
  return row;
}

export interface StaleOpenBySalonRow {
  salon_id: string;
  salon_name: string;
  site_name: string;
  stale_count: number;
  affected_therapist_count: number;
  oldest_date: string;
}

export async function fetchStaleOpenBySalon(
  limit = 20,
): Promise<StaleOpenBySalonRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_stale_open_slots_by_salon", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as StaleOpenBySalonRow[];
}

export interface StaleOpenSlotRow {
  therapist_id: string;
  therapist_name: string;
  salon_id: string;
  salon_name: string;
  site_name: string;
  slot_date: string;
  start_time: string;
  last_state_change_at: string;
  first_seen_at: string;
}

export async function fetchStaleOpenSlotsList(
  limit = 50,
): Promise<StaleOpenSlotRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_stale_open_slots_list", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as StaleOpenSlotRow[];
}
