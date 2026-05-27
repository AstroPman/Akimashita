import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BellPlusIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  HourglassIcon,
  UserRoundIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  TherapistStatsBlock,
} from "@/app/(authenticated)/watches/_components/therapist-stats";
import {
  getPublicSalon,
  getPublicSalonTherapist,
  getPublicSalonTherapists,
  getPublicTherapistStats,
  type PublicTherapistStats,
} from "@/lib/salons";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getUserPlanTier } from "@/lib/seats";
import { isPaidTier } from "@/lib/plans";
import { KillSecondsGateCard } from "../../../_components/kill-seconds-gate-card";

interface PageProps {
  params: Promise<{ id: string; therapist_id: string }>;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

function buildCanonical(salonId: string, therapistId: string): string {
  return `${SITE_URL}/salons/${salonId}/therapists/${therapistId}`;
}

function buildMetaDescription(
  salonName: string,
  displayName: string,
  prefecture: string | null,
  areas: string[],
  stylePieces: string[],
): string {
  const loc = [prefecture, ...areas.slice(0, 2)].filter(Boolean).join(" / ");
  const style = stylePieces.length > 0 ? `（${stylePieces.join(" / ")}）` : "";
  return [
    `${salonName} 所属のセラピスト「${displayName}」${style}のプロフィールページです。`,
    loc ? `所在: ${loc}。` : "",
    "アキマシタなら空き枠が出た瞬間にメール通知します。",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id, therapist_id } = await params;
  const [salon, therapist] = await Promise.all([
    getPublicSalon(id),
    getPublicSalonTherapist(id, therapist_id),
  ]);
  if (!salon || !therapist) {
    return { title: "セラピストが見つかりませんでした" };
  }
  const stylePieces: string[] = [];
  if (therapist.height) stylePieces.push(`T${therapist.height}`);
  if (therapist.cup) stylePieces.push(`${therapist.cup}カップ`);
  if (therapist.age) stylePieces.push(`${therapist.age}歳`);

  const title = `${therapist.displayName} - ${salon.name}`;
  const description = buildMetaDescription(
    salon.name,
    therapist.displayName,
    salon.prefecture,
    salon.areas,
    stylePieces,
  );
  const canonical = buildCanonical(id, therapist_id);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
      images: therapist.primaryImageUrl
        ? [{ url: therapist.primaryImageUrl }]
        : undefined,
    },
  };
}

async function getCurrentUserPaidStatus(): Promise<{
  authenticated: boolean;
  paid: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { authenticated: false, paid: false };
  const tier = await getUserPlanTier(user.id);
  return { authenticated: true, paid: isPaidTier(tier) };
}

function hasAnyStatsData(stats: PublicTherapistStats | null): boolean {
  if (!stats) return false;
  return (
    stats.watcher_count > 0 ||
    stats.recent_shift_days > 0 ||
    stats.recent_opening_count > 0 ||
    stats.dow_hour_heatmap.length > 0 ||
    stats.next_shift_date !== null ||
    stats.next_available_slot !== null
  );
}

export default async function PublicTherapistDetailPage({
  params,
}: PageProps) {
  const { id, therapist_id } = await params;

  const [salon, therapist, allTherapists, stats, paidStatus] =
    await Promise.all([
      getPublicSalon(id),
      getPublicSalonTherapist(id, therapist_id),
      getPublicSalonTherapists(id),
      getPublicTherapistStats(therapist_id),
      getCurrentUserPaidStatus(),
    ]);

  if (!salon || !therapist) {
    notFound();
  }

  const stylePieces: string[] = [];
  if (therapist.height) stylePieces.push(`T${therapist.height}`);
  if (therapist.cup) stylePieces.push(`${therapist.cup}カップ`);
  if (therapist.age) stylePieces.push(`${therapist.age}歳`);
  const styleLabel =
    stylePieces.length > 0 ? stylePieces.join(" / ") : therapist.styleRaw;

  const watchAddHref = `/watches/new?therapist_id=${encodeURIComponent(
    therapist_id,
  )}`;

  const canonicalUrl = buildCanonical(id, therapist_id);

  const showStats = hasAnyStatsData(stats);

  // 他のセラピスト (同サロン) のサジェスト。最大 6 件。
  const otherTherapists = allTherapists
    .filter((t) => t.id !== therapist.id)
    .slice(0, 6);

  // 構造化データ (Person)
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: therapist.displayName,
    image: therapist.primaryImageUrl || undefined,
    url: canonicalUrl,
    worksFor: {
      "@type": "Organization",
      name: salon.name,
      url: `${SITE_URL}/salons/${id}`,
    },
    description: therapist.comment ?? undefined,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "ホーム",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "サロン・セラピスト検索",
        item: `${SITE_URL}/salons`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: salon.name,
        item: `${SITE_URL}/salons/${id}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: therapist.displayName,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />

      <SiteHeader />

      <main className="flex-1 pb-24 sm:pb-12">
        <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
          <nav
            aria-label="パンくず"
            className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            <Link href="/" className="hover:text-foreground hover:underline">
              ホーム
            </Link>
            <span aria-hidden>/</span>
            <Link
              href="/salons"
              className="hover:text-foreground hover:underline"
            >
              サロン・セラピスト検索
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/salons/${id}`}
              className="hover:text-foreground hover:underline"
            >
              {salon.name}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-foreground">{therapist.displayName}</span>
          </nav>

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 mt-3 gap-1"
          >
            <Link href={`/salons/${id}`}>
              <ChevronLeftIcon className="size-4" />
              {salon.name} のセラピスト一覧
            </Link>
          </Button>

          <section className="mt-4 rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="relative aspect-[3/4] w-full max-w-[14rem] shrink-0 overflow-hidden rounded-lg bg-muted sm:w-48">
                {therapist.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 予約サイト由来でホストが不定のため next/image の許可リストに載せない
                  <img
                    src={therapist.primaryImageUrl}
                    alt={`${therapist.displayName} のプロフィール写真`}
                    className="size-full object-cover"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex size-full items-center justify-center text-muted-foreground"
                    aria-hidden
                  >
                    <UserRoundIcon
                      className="size-20"
                      strokeWidth={1.25}
                    />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                    {therapist.displayName}
                  </h1>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {salon.name}
                  </p>
                  {styleLabel ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {styleLabel}
                    </p>
                  ) : null}
                </div>

                {(salon.prefecture || salon.areas.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {salon.prefecture ? (
                      <Badge variant="secondary" className="font-normal">
                        {salon.prefecture}
                      </Badge>
                    ) : null}
                    {salon.areas.slice(0, 4).map((a) => (
                      <span key={a} className="truncate">
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {therapist.comment ? (
                  <p className="whitespace-pre-line pt-2 text-sm leading-6 text-foreground/80">
                    {therapist.comment}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <Button asChild size="sm" className="gap-1.5">
                    <Link href={watchAddHref}>
                      <BellPlusIcon className="size-4" />
                      空き通知に追加
                    </Link>
                  </Button>
                  {therapist.profileUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={therapist.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gap-1"
                      >
                        予約サイトを開く
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </Button>
                  ) : null}
                  {therapist.externalProfileUrl ? (
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={therapist.externalProfileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gap-1"
                      >
                        公式プロフィール
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                集計情報
              </h2>
              <span className="text-xs text-muted-foreground">
                直近 {stats?.window_days ?? 30} 日間
              </span>
            </div>

            {showStats && stats ? (
              <TherapistStatsBlock
                stats={stats}
                killSecondsGate={
                  paidStatus.paid
                    ? undefined
                    : (
                        <KillSecondsGateCard
                          ctaHref={
                            paidStatus.authenticated
                              ? "/pricing?reason=kill_seconds"
                              : "/signup"
                          }
                          ctaLabel={
                            paidStatus.authenticated
                              ? "有料プランで瞬殺時間を確認"
                              : "登録すると瞬殺時間が見られます"
                          }
                          description="瞬殺時間は有料プランで公開しています。"
                        />
                      )
                }
              />
            ) : (
              <div className="rounded-xl border border-dashed bg-card p-6">
                <div className="flex items-start gap-3">
                  <HourglassIcon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      まだこのセラピストの集計データはありません
                    </p>
                    <p className="text-sm text-muted-foreground">
                      アキマシタは「空き枠通知」に登録されたセラピストのみを 1
                      分間隔で監視します。最初の空き通知が登録されると、出勤予定や瞬殺時間などの集計が始まります。
                    </p>
                    <div className="pt-2">
                      <Button asChild size="sm" className="gap-1.5">
                        <Link href={watchAddHref}>
                          <BellPlusIcon className="size-4" />
                          空き通知に追加して集計を開始
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {otherTherapists.length > 0 && (
            <section className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">
                同じ {salon.name} の他のセラピスト
              </h2>
              <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {otherTherapists.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/salons/${id}/therapists/${t.id}`}
                      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm outline-none transition-colors hover:border-foreground/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                        {t.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 外部ホスト由来で next/image の許可リストに載せない
                          <img
                            src={t.primaryImageUrl}
                            alt=""
                            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className="flex size-full items-center justify-center text-muted-foreground"
                            aria-hidden
                          >
                            <UserRoundIcon
                              className="size-10"
                              strokeWidth={1.25}
                            />
                          </div>
                        )}
                      </div>
                      <p className="truncate p-2 text-xs font-medium leading-tight">
                        {t.displayName}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:hidden">
        <Button asChild className="w-full gap-1.5">
          <Link href={watchAddHref}>
            <BellPlusIcon className="size-4" />
            空き通知に追加
          </Link>
        </Button>
      </div>

      <SiteFooter />
    </div>
  );
}
