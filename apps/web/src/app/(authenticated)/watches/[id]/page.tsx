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
import { resolveTherapistImageSrc } from "@/lib/therapist-image";
import { RefreshOnMount } from "../_components/refresh-on-mount";
import {
  TherapistStatsBlock,
  type TherapistStats,
} from "../_components/therapist-stats";

export const metadata: Metadata = {
  title: "セラピストの詳細",
};

type ExternalTherapistRow = {
  primary_image_url: string | null;
  display_name: string | null;
  age: number | null;
  height: number | null;
  cup: string | null;
  style_raw: string | null;
  comment: string | null;
  therapist_url: string | null;
};

type WatchDetail = {
  id: string;
  therapist_id: string;
  therapists: {
    id: string;
    name: string;
    image_url: string | null;
    profile_url: string | null;
    external_therapists:
      | ExternalTherapistRow
      | ExternalTherapistRow[]
      | null;
    salons: {
      id: string;
      name: string;
      url: string | null;
      external_salons: {
        homepage_url: string | null;
      } | null;
    };
  };
};

function pickExternalTherapist(
  ext: ExternalTherapistRow | ExternalTherapistRow[] | null,
): ExternalTherapistRow | null {
  if (!ext) return null;
  return Array.isArray(ext) ? (ext[0] ?? null) : ext;
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
        external_therapists (
          primary_image_url, display_name, age, height, cup, style_raw, comment, therapist_url
        ),
        salons!inner (
          id, name, url,
          external_salons (homepage_url)
        )
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
  const salonHomepageUrl = salon.external_salons?.homepage_url ?? null;
  const ext = pickExternalTherapist(therapist.external_therapists);
  const imageSrc =
    ext?.primary_image_url ??
    resolveTherapistImageSrc(therapist.image_url, therapist.profile_url);
  const displayName = ext?.display_name ?? therapist.name;
  // 身長/カップを優先的に表示する。それ以外は ext.style_raw を fallback として使う。
  const styleParts: string[] = [];
  if (ext?.height) styleParts.push(`T${ext.height}`);
  if (ext?.cup) styleParts.push(`${ext.cup}カップ`);
  if (ext?.age) styleParts.push(`${ext.age}歳`);
  const styleLabel =
    styleParts.length > 0 ? styleParts.join(" / ") : (ext?.style_raw ?? null);

  return (
    <div className="space-y-6 pb-24 sm:pb-6">
      <RefreshOnMount />
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
                referrerPolicy="no-referrer"
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
              {displayName}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {salon.name}
              {styleLabel ? (
                <span className="ml-2 text-muted-foreground/70">{styleLabel}</span>
              ) : null}
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
              {ext?.therapist_url ? (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={ext.therapist_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-1"
                  >
                    公式プロフィール
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                </Button>
              ) : null}
              {salonHomepageUrl ? (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={salonHomepageUrl}
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
            {ext?.comment ? (
              <p className="pt-2 text-sm text-muted-foreground whitespace-pre-line">
                {ext.comment}
              </p>
            ) : null}
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
