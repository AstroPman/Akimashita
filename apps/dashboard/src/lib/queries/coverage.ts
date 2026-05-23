import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// stats_salons_coverage
// ============================================================
export interface SalonsCoverage {
  salons_active: number;
  salons_with_url: number;
  salons_with_homepage_url: number;
  salons_linked_external: number;
  salons_never_synced: number;
  salons_stale_synced: number;
  linked_external_salons_active: number;
  linked_with_prefecture: number;
  linked_with_areas: number;
  linked_with_nearest_stations: number;
  linked_with_genre: number;
  linked_with_price_range: number;
  linked_with_opening_hours: number;
  linked_with_homepage_url: number;
  ex_active: number;
  ex_with_prefecture: number;
  ex_with_areas: number;
  ex_with_nearest_stations: number;
  ex_with_genre: number;
  ex_with_price_range: number;
  ex_with_opening_hours: number;
  ex_with_homepage_url: number;
  ex_with_bookings: number;
}

export async function fetchSalonsCoverage(): Promise<SalonsCoverage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_salons_coverage");
  if (error) throw error;
  const row = (data ?? [])[0] as SalonsCoverage | undefined;
  if (!row) {
    throw new Error("stats_salons_coverage が結果を返しませんでした");
  }
  return row;
}

// ============================================================
// stats_salons_status
// ============================================================
export type SalonStatusCategory =
  | "active_with_therapists"
  | "active_no_therapists"
  | "stale_synced"
  | "never_synced"
  | "closed_external"
  | "closed_internal";

export const SALON_STATUS_LABEL: Record<SalonStatusCategory, string> = {
  active_with_therapists: "稼働中",
  active_no_therapists: "閉店疑い",
  stale_synced: "同期停滞",
  never_synced: "未同期",
  closed_external: "外部側削除",
  closed_internal: "内部削除済",
};

export const SALON_STATUS_HINT: Record<SalonStatusCategory, string> = {
  active_with_therapists: "deleted_at NULL かつ在籍セラピスト >= 1",
  active_no_therapists: "直近同期済みなのに在籍 0 (= 閉店の可能性)",
  stale_synced: "last_synced_at が 7 日以上前 (Stage 2 故障の疑い)",
  never_synced: "last_synced_at NULL (Stage 2 が走っていない)",
  closed_external: "外部ポータルで 404 / canonical 不一致 → 次の論理削除候補",
  closed_internal: "salons.deleted_at が立っている",
};

export const SALON_STATUS_ORDER: SalonStatusCategory[] = [
  "active_with_therapists",
  "active_no_therapists",
  "stale_synced",
  "never_synced",
  "closed_external",
  "closed_internal",
];

export interface SalonStatusRow {
  category: SalonStatusCategory;
  cnt: number;
}

export async function fetchSalonsStatus(): Promise<SalonStatusRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_salons_status");
  if (error) throw error;
  return (data ?? []) as SalonStatusRow[];
}

// ============================================================
// stats_therapists_coverage
// ============================================================
export interface TherapistsCoverage {
  therapists_active: number;
  t_with_profile_url: number;
  t_with_image_url: number;
  t_with_description: number;
  t_with_age: number;
  t_with_height: number;
  t_with_bwh: number;
  t_with_cup: number;
  t_linked_external: number;
  t_never_synced: number;
  t_stale_synced: number;
  linked_total: number;
  linked_with_age: number;
  linked_with_height: number;
  linked_with_cup: number;
  linked_with_image: number;
  linked_with_therapist_url: number;
  linked_with_comment: number;
  external_therapists_active: number;
  ex_with_age: number;
  ex_with_height: number;
  ex_with_cup: number;
  ex_with_image: number;
  ex_with_therapist_url: number;
  ex_with_comment: number;
  ex_with_kana: number;
  ex_status_active: number;
  ex_status_retired: number;
}

export async function fetchTherapistsCoverage(): Promise<TherapistsCoverage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_therapists_coverage");
  if (error) throw error;
  const row = (data ?? [])[0] as TherapistsCoverage | undefined;
  if (!row) {
    throw new Error("stats_therapists_coverage が結果を返しませんでした");
  }
  return row;
}

// ============================================================
// stats_areas_coverage
// ============================================================
export interface AreaCoverageRow {
  prefecture: string;
  external_count: number;
  linked_count: number;
  unlinked_count: number;
}

export async function fetchAreasCoverage(): Promise<AreaCoverageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_areas_coverage");
  if (error) throw error;
  return (data ?? []) as AreaCoverageRow[];
}

// ============================================================
// stats_external_salons_orphans
// ============================================================
export interface ExternalSalonOrphanRow {
  external_salon_id: string;
  name: string;
  prefecture: string | null;
  homepage_url: string | null;
  source_url: string | null;
  bookings_count: number;
  site_names: string[];
}

export async function fetchExternalSalonsOrphans(
  limit: number,
): Promise<ExternalSalonOrphanRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_external_salons_orphans", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ExternalSalonOrphanRow[];
}
