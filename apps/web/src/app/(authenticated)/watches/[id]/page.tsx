import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  PencilIcon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  TherapistStatsBlock,
  type TherapistStats,
} from "../_components/therapist-stats";

export const metadata: Metadata = {
  title: "セラピストの詳細",
};

type WatchDetail = {
  id: string;
  therapist_id: string;
  therapists: {
    id: string;
    name: string;
    image_url: string | null;
    profile_url: string | null;
    salons: {
      id: string;
      name: string;
      url: string | null;
    };
  };
};

function resolveTherapistImageSrc(
  imageUrl: string | null,
  profileUrl: string | null,
): string | null {
  if (!imageUrl?.trim()) return null;
  const trimmed = imageUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!profileUrl) return null;
  try {
    return new URL(trimmed, profileUrl).href;
  } catch {
    return null;
  }
}

export default async function WatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: watch } = await supabase
    .from("watch_settings")
    .select(
      `
      id,
      therapist_id,
      therapists!inner (
        id, name, image_url, profile_url,
        salons!inner (id, name, url)
      )
    `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!watch) {
    notFound();
  }

  const watchTyped = watch as unknown as WatchDetail;

  const { data: statsData, error: statsError } = await supabase.rpc(
    "get_therapist_stats",
    {
      p_therapist_id: watchTyped.therapist_id,
      p_window_days: 30,
    },
  );

  const stats = statsError ? null : (statsData as TherapistStats | null);

  const therapist = watchTyped.therapists;
  const salon = therapist.salons;
  const imageSrc = resolveTherapistImageSrc(
    therapist.image_url,
    therapist.profile_url,
  );

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/watches">
          <ChevronLeftIcon className="size-4" />
          一覧に戻る
        </Link>
      </Button>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
            {imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- 予約サイト由来でホストが不定のため next/image の許可リストに載せない
              <img
                src={imageSrc}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div
                className="flex size-full items-center justify-center text-muted-foreground"
                aria-hidden
              >
                <UserRoundIcon className="size-10" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {therapist.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {salon.name}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {therapist.profile_url ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={therapist.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-1"
                  >
                    予約サイトを開く
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                </Button>
              ) : null}
              {salon.url ? (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={salon.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-1"
                  >
                    サロンページ
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {stats ? (
        <TherapistStatsBlock stats={stats} />
      ) : (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          集計情報の取得に失敗しました。時間を置いて再度お試しください。
        </div>
      )}

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/watches/${watchTyped.id}/edit`}>
            <PencilIcon className="size-4" />
            監視設定を編集
          </Link>
        </Button>
      </div>
    </div>
  );
}
