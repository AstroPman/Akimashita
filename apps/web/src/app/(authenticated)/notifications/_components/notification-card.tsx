import Link from "next/link";
import { MailIcon, MegaphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatJstDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "./notification-list";

interface Props {
  item: NotificationItem;
}

const PREVIEW_MAX_LENGTH = 120;

function buildPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

export function NotificationCard({ item }: Props) {
  const unread = !item.readAt;
  const isAnnouncement = item.kind === "announcement";
  const title = isAnnouncement ? item.title : item.subject;
  const href =
    item.kind === "email"
      ? `/notifications/email/${item.id}`
      : `/notifications/announcement/${item.id}`;
  const preview = buildPreview(item.bodyText);

  return (
    <Link
      href={href}
      aria-label={isAnnouncement ? "お知らせの詳細を開く" : "通知メールの詳細を開く"}
      className={cn(
        "block rounded-xl border bg-card text-card-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        unread && "border-l-4 border-l-primary",
      )}
    >
      <article>
        <header className="flex flex-col gap-2 px-6 pt-4">
          <div className="flex items-center justify-between gap-3">
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
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={item.occurredAt}
            >
              {formatJstDateTime(item.occurredAt)}
            </time>
          </div>
          <h2 className="break-words text-base font-semibold">
            {title}
          </h2>
        </header>

        <p className="line-clamp-2 px-6 pt-3 pb-5 text-sm text-muted-foreground">
          {preview}
        </p>
      </article>
    </Link>
  );
}
