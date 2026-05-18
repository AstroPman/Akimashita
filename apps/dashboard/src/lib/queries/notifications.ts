import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationStatus = "pending" | "sending" | "sent" | "failed";

export interface NotificationStatusDailyRow {
  day: string;
  status: NotificationStatus;
  cnt: number;
}

export async function fetchNotificationsStatusDaily(
  days: number,
): Promise<NotificationStatusDailyRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "stats_notifications_status_daily",
    { p_days: days },
  );
  if (error) throw error;
  return (data ?? []) as NotificationStatusDailyRow[];
}

export interface NotificationsSummary {
  sent_count: number;
  failed_count: number;
  pending_count: number;
  sending_count: number;
  success_rate: number | null;
  oldest_pending_at: string | null;
}

export async function fetchNotificationsSummary(
  hours: number,
): Promise<NotificationsSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_notifications_summary", {
    p_hours: hours,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as NotificationsSummary | undefined;
  if (!row) {
    throw new Error("stats_notifications_summary が結果を返しませんでした");
  }
  return row;
}

export interface NotificationsDelay {
  sample_count: number;
  p50_seconds: number | null;
  p95_seconds: number | null;
  avg_seconds: number | null;
  max_seconds: number | null;
}

export async function fetchNotificationsDelay(
  hours: number,
): Promise<NotificationsDelay> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("stats_notifications_delay", {
    p_hours: hours,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as NotificationsDelay | undefined;
  if (!row) {
    throw new Error("stats_notifications_delay が結果を返しませんでした");
  }
  return row;
}

export interface NotificationsFailedTopRow {
  error_text: string;
  cnt: number;
}

export async function fetchNotificationsFailedTop(
  hours: number,
  limit: number,
): Promise<NotificationsFailedTopRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "stats_notifications_failed_top",
    { p_hours: hours, p_limit: limit },
  );
  if (error) throw error;
  return (data ?? []) as NotificationsFailedTopRow[];
}
