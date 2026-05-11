import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, MailIcon } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatJstDateTime } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import { AutoMarkRead } from "../../_components/auto-mark-read";

export const metadata: Metadata = {
  title: "通知メールの詳細",
};

const IdSchema = z.string().uuid();

interface NotificationEmailRow {
  id: string;
  subject: string;
  body_text: string;
  sent_at: string;
  read_at: string | null;
}

export default async function NotificationEmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    notFound();
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_emails")
    .select("id, subject, body_text, sent_at, read_at")
    .eq("id", parsed.data)
    .maybeSingle<NotificationEmailRow>();

  if (!data) {
    notFound();
  }

  const unread = !data.read_at;

  return (
    <div className="space-y-6">
      {unread ? <AutoMarkRead kind="email" id={data.id} /> : null}

      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/notifications">
          <ChevronLeftIcon className="size-4" />
          通知一覧に戻る
        </Link>
      </Button>

      <article className="rounded-xl border bg-card text-card-foreground">
        <header className="space-y-3 border-b px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Badge variant="secondary" className="shrink-0 gap-1">
              <MailIcon className="size-3" />
              通知メール
            </Badge>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={data.sent_at}
            >
              {formatJstDateTime(data.sent_at)}
            </time>
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {data.subject}
          </h1>
        </header>

        <div className="px-5 py-5">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
            {data.body_text}
          </pre>
        </div>
      </article>
    </div>
  );
}
