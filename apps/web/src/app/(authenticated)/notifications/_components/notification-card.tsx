"use client";

import { CheckIcon, MailIcon, MegaphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatJstDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "./notification-list";

interface Props {
  item: NotificationItem;
  onMarkRead: () => void;
}

export function NotificationCard({ item, onMarkRead }: Props) {
  const unread = !item.readAt;
  const isAnnouncement = item.kind === "announcement";
  const title = isAnnouncement ? item.title : item.subject;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card text-card-foreground transition-colors",
        unread && "border-l-4 border-l-primary",
      )}
      aria-label={isAnnouncement ? "お知らせ" : "メール通知"}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {isAnnouncement ? (
            <Badge variant="default" className="shrink-0 gap-1">
              <MegaphoneIcon className="size-3" />
              お知らせ
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <MailIcon className="size-3" />
              通知メール
            </Badge>
          )}
          <h2 className="min-w-0 break-words text-base font-semibold">
            {title}
          </h2>
        </div>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={item.occurredAt}
        >
          {formatJstDateTime(item.occurredAt)}
        </time>
      </header>

      <div className="px-5 pt-3 pb-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90">
          {item.bodyText}
        </pre>
      </div>

      <footer className="flex items-center justify-end gap-3 border-t bg-muted/30 px-5 py-2">
        {unread ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMarkRead}
            className="gap-1.5 text-xs"
          >
            <CheckIcon className="size-3.5" />
            既読にする
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">既読</span>
        )}
      </footer>
    </article>
  );
}
