import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ExternalDailyRow {
  day: string;
  new_rows: number;
  deleted_rows: number;
  cumulative_total: number;
  cumulative_active: number;
}

export async function fetchExternalSalonsDaily(
  days: number,
): Promise<ExternalDailyRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_external_salons_daily", {
    p_days: days,
  });
  if (error) throw error;
  return (data ?? []) as ExternalDailyRow[];
}

export async function fetchExternalTherapistsDaily(
  days: number,
): Promise<ExternalDailyRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "stats_external_therapists_daily",
    { p_days: days },
  );
  if (error) throw error;
  return (data ?? []) as ExternalDailyRow[];
}

export interface TablesOverview {
  external_salons_total: number;
  external_salons_active: number;
  external_therapists_total: number;
  external_therapists_active: number;
  salons_total: number;
  salons_active: number;
  salons_linked: number;
  therapists_total: number;
  therapists_active: number;
  therapists_linked: number;
}

export async function fetchTablesOverview(): Promise<TablesOverview> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_tables_overview");
  if (error) throw error;
  const row = (data ?? [])[0] as TablesOverview | undefined;
  if (!row) {
    throw new Error("stats_tables_overview が結果を返しませんでした");
  }
  return row;
}

export interface SitesBreakdownRow {
  site_name: string;
  salons_active: number;
  salons_linked: number;
  therapists_active: number;
  therapists_linked: number;
}

export async function fetchSitesBreakdown(): Promise<SitesBreakdownRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_sites_breakdown");
  if (error) throw error;
  return (data ?? []) as SitesBreakdownRow[];
}
