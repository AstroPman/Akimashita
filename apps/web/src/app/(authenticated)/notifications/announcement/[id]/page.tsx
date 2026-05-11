import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, MegaphoneIcon } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatJstDateTime } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import { AutoMarkRead } from "../../_components/auto-mark-read";

export const metadata: Metadata = {
  title: "お知らせの詳細",
};

const IdSchema = z.string().uuid();

interface AnnouncementRow {
  id: string;
  title: string;
  body_text: string;
  published_at: string;
}

interface AnnouncementReadRow {
  announcement_id: string;
}

export default async function AnnouncementDetailPage({
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

  const [announcementResult, readResult] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body_text, published_at")
      .eq("id", parsed.data)
      .maybeSingle<AnnouncementRow>(),
    supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("announcement_id", parsed.data)
      .maybeSingle<AnnouncementReadRow>(),
  ]);

  const data = announcementResult.data;
  if (!data) {
    notFound();
  }

  const unread = !readResult.data;

  return (
    <div className="space-y-6">
      {unread ? <AutoMarkRead kind="announcement" id={data.id} /> : null}

      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/notifications">
          <ChevronLeftIcon className="size-4" />
          通知一覧に戻る
        </Link>
      </Button>

      <article className="rounded-xl border bg-card text-card-foreground">
        <header className="space-y-3 border-b px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Badge variant="default" className="shrink-0 gap-1">
              <MegaphoneIcon className="size-3" />
              お知らせ
            </Badge>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={data.published_at}
            >
              {formatJstDateTime(data.published_at)}
            </time>
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {data.title}
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
