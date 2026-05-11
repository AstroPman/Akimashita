import { NotificationCard } from "./notification-card";

export interface EmailItem {
  kind: "email";
  id: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  occurredAt: string;
  readAt: string | null;
}

export interface AnnouncementItem {
  kind: "announcement";
  id: string;
  title: string;
  bodyText: string;
  bodyHtml: string | null;
  occurredAt: string;
  readAt: string | null;
}

export type NotificationItem = EmailItem | AnnouncementItem;

export function NotificationList({ items }: { items: NotificationItem[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <NotificationCard item={item} />
        </li>
      ))}
    </ul>
  );
}
