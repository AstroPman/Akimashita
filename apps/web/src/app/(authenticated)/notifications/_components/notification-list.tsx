"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { NotificationCard } from "./notification-card";
import { markAnnouncementRead, markEmailRead } from "../actions";

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

type OptimisticAction = {
  type: "markRead";
  kind: "email" | "announcement";
  id: string;
  readAt: string;
};

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (state, action: OptimisticAction) =>
      state.map((it) =>
        it.kind === action.kind && it.id === action.id
          ? { ...it, readAt: action.readAt }
          : it,
      ),
  );

  const [, startTransition] = useTransition();

  const handleMarkRead = (item: NotificationItem) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    startTransition(async () => {
      applyOptimistic({
        type: "markRead",
        kind: item.kind,
        id: item.id,
        readAt,
      });
      const res =
        item.kind === "email"
          ? await markEmailRead({ id: item.id })
          : await markAnnouncementRead({ id: item.id });
      if (!res.ok) {
        toast.error(res.message);
      }
    });
  };

  return (
    <ul className="grid gap-3">
      {optimisticItems.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <NotificationCard item={item} onMarkRead={() => handleMarkRead(item)} />
        </li>
      ))}
    </ul>
  );
}
