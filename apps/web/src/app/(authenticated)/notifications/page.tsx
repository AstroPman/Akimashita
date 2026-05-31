import type { Metadata } from "next";
import { NotificationTimingDisclaimer } from "@/components/notification-timing-disclaimer";
import { createClient } from "@/lib/supabase/server";
import { MarkAllReadButton } from "./_components/mark-all-read-button";
import { NotificationList } from "./_components/notification-list";
import type {
  AnnouncementItem,
  EmailItem,
} from "./_components/notification-list";

export const metadata: Metadata = {
  title: "通知一覧",
};

interface NotificationEmailRow {
  id: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  sent_at: string;
  read_at: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body_text: string;
  body_html: string | null;
  published_at: string;
}

interface AnnouncementReadRow {
  announcement_id: string;
  read_at: string;
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  const [emailsResult, announcementsResult, readsResult] = await Promise.all([
    supabase
      .from("notification_emails")
      .select("id, subject, body_text, body_html, sent_at, read_at")
      .order("sent_at", { ascending: false })
      .limit(50)
      .returns<NotificationEmailRow[]>(),
    supabase
      .from("announcements")
      .select("id, title, body_text, body_html, published_at")
      .order("published_at", { ascending: false })
      .returns<AnnouncementRow[]>(),
    supabase
      .from("announcement_reads")
      .select("announcement_id, read_at")
      .returns<AnnouncementReadRow[]>(),
  ]);

  const error =
    emailsResult.error ?? announcementsResult.error ?? readsResult.error;

  const readMap = new Map<string, string>();
  for (const row of readsResult.data ?? []) {
    readMap.set(row.announcement_id, row.read_at);
  }

  const emails: EmailItem[] = (emailsResult.data ?? []).map((row) => ({
    kind: "email",
    id: row.id,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    occurredAt: row.sent_at,
    readAt: row.read_at,
  }));

  const announcements: AnnouncementItem[] = (announcementsResult.data ?? []).map(
    (row) => ({
      kind: "announcement",
      id: row.id,
      title: row.title,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      occurredAt: row.published_at,
      readAt: readMap.get(row.id) ?? null,
    }),
  );

  const items = [...emails, ...announcements].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );

  const hasUnread = items.some((item) => !item.readAt);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">通知一覧</h1>
            <p className="text-sm text-muted-foreground">
              空き枠のメール通知履歴と運営からのお知らせを確認できます。
            </p>
          </div>
          {!error && hasUnread ? <MarkAllReadButton /> : null}
        </div>
        <NotificationTimingDisclaimer />
      </div>

      {error ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
          通知の取得に失敗しました: {error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            まだ通知はありません。
          </p>
        </div>
      ) : (
        <NotificationList items={items} />
      )}
    </div>
  );
}
