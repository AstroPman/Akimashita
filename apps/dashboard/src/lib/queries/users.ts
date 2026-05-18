import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UsersDailyRow {
  day: string;
  new_users: number;
  deleted_users: number;
  cumulative_users: number;
}

export async function fetchUsersDaily(days: number): Promise<UsersDailyRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_users_daily", {
    p_days: days,
  });
  if (error) throw error;
  return (data ?? []) as UsersDailyRow[];
}

export type PlanTier = "free" | "standard" | "premium";

export interface PlanBreakdownRow {
  plan_tier: PlanTier;
  user_count: number;
}

export async function fetchUserPlanBreakdown(): Promise<PlanBreakdownRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_user_plan_breakdown");
  if (error) throw error;
  return (data ?? []) as PlanBreakdownRow[];
}

export const PLAN_LABEL: Record<PlanTier, string> = {
  free: "無料",
  standard: "スタンダード",
  premium: "プレミアム",
};
