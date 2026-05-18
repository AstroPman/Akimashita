import { createClient } from "@/lib/supabase/server";

/**
 * ログイン中ユーザの未読通知件数を返す。
 *
 * 内訳は「未読のメール通知」+「未読のお知らせ（公開済み合計 − 既読数）」。
 * RLS が `user_id = auth.uid()` で絞り込むため、where 句を明示しなくてよい。
 * `head: true` で行を返さず count のみ取得する。
 *
 * 未ログイン時は呼ばないこと（呼び出し側で `user` の有無をチェックする想定）。
 */
export async function fetchUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();

  const [emailsRes, announcementsRes, readsRes] = await Promise.all([
    supabase
      .from("notification_emails")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    supabase
      .from("announcements")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("announcement_reads")
      .select("announcement_id", { count: "exact", head: true }),
  ]);

  const unreadEmails = emailsRes.count ?? 0;
  const totalAnnouncements = announcementsRes.count ?? 0;
  const readAnnouncements = readsRes.count ?? 0;
  const unreadAnnouncements = Math.max(
    0,
    totalAnnouncements - readAnnouncements,
  );
  return unreadEmails + unreadAnnouncements;
}
