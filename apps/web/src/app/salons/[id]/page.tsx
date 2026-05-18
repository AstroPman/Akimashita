import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BellPlusIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  MapPinIcon,
  UserRoundIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSalon, getPublicSalonTherapists } from "@/lib/salons";

interface PageProps {
  params: Promise<{ id: string }>;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

function buildCanonical(id: string): string {
  return `${SITE_URL}/salons/${id}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const salon = await getPublicSalon(id);
  if (!salon) {
    return { title: "サロンが見つかりませんでした" };
  }
  const loc = [salon.prefecture, ...salon.areas.slice(0, 2)]
    .filter(Boolean)
    .join(" / ");
  const title = `${salon.name} のセラピスト一覧 / 空き通知`;
  const description = `${salon.name}${
    loc ? `（${loc}）` : ""
  }のセラピスト一覧と、空き枠が出た瞬間に届くメール通知の登録ページです。在籍${salon.therapistCount}名。`;
  const canonical = buildCanonical(id);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
    },
  };
}

export default async function SalonDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [salon, therapists] = await Promise.all([
    getPublicSalon(id),
    getPublicSalonTherapists(id),
  ]);

  if (!salon) {
    notFound();
  }

  const canonical = buildCanonical(id);

  // 構造化データ: LocalBusiness (prefecture を addressRegion として露出)
  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": canonical,
    name: salon.name,
    url: canonical,
    address: salon.prefecture
      ? {
          "@type": "PostalAddress",
          addressCountry: "JP",
          addressRegion: salon.prefecture,
          addressLocality: salon.areas[0] ?? undefined,
        }
      : undefined,
    areaServed: salon.areas.length > 0 ? salon.areas : undefined,
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
        item: canonical,
      },
    ],
  };

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(localBusinessJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />

      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-12">
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
            <span className="text-foreground">{salon.name}</span>
          </nav>

          <Button asChild variant="ghost" size="sm" className="-ml-2 mt-2 gap-1">
            <Link href="/salons">
              <ChevronLeftIcon className="size-4" />
              サロン・セラピスト検索へ
            </Link>
          </Button>

          <div className="mt-4">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {salon.name}
            </h1>
            {(salon.prefecture || salon.areas.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <MapPinIcon className="size-4 shrink-0" aria-hidden />
                {salon.prefecture && (
                  <Badge variant="secondary" className="font-normal">
                    {salon.prefecture}
                  </Badge>
                )}
                {salon.areas.map((area) => (
                  <span key={area} className="truncate">
                    {area}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              在籍セラピスト{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {salon.therapistCount}
              </span>{" "}
              名
            </p>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">
              在籍セラピスト
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              カードをタップするとプロフィールと出勤集計を確認できます。
            </p>

            {therapists.length === 0 ? (
              <p className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                セラピスト情報を準備中です。しばらくしてから再度ご確認ください。
              </p>
            ) : (
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {therapists.map((t) => (
                  <li
                    key={t.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted text-white shadow-sm"
                  >
                    <Link
                      href={`/salons/${id}/therapists/${t.id}`}
                      aria-label={`${t.displayName} の詳細を見る`}
                      className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 外部ホスト由来で next/image の許可リストに載せない
                        <img
                          src={t.primaryImageUrl}
                          alt=""
                          className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="flex size-full items-center justify-center bg-muted text-muted-foreground"
                          aria-hidden
                        >
                          <UserRoundIcon
                            className="size-16"
                            strokeWidth={1.25}
                          />
                        </div>
                      )}
                    </Link>

                    <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
                      {t.externalProfileUrl ? (
                        <Button
                          asChild
                          size="icon-sm"
                          variant="secondary"
                          className="rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70 hover:text-white"
                        >
                          <a
                            href={t.externalProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${t.displayName} の公式プロフィール`}
                          >
                            <ExternalLinkIcon className="size-3.5" />
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        asChild
                        size="icon-sm"
                        className="rounded-full shadow-md sm:hidden"
                      >
                        <Link
                          href={`/watches/new?therapist_id=${encodeURIComponent(
                            t.id,
                          )}`}
                          aria-label={`${t.displayName} を空き通知に追加`}
                        >
                          <BellPlusIcon className="size-3.5" />
                        </Link>
                      </Button>
                    </div>

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
                      <div className="[text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                        <h3 className="line-clamp-1 text-sm font-semibold leading-tight sm:text-base">
                          {t.displayName}
                        </h3>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/90 sm:text-xs">
                          {t.height ? <span>T{t.height}</span> : null}
                          {t.cup ? <span>{t.cup}カップ</span> : null}
                          {t.styleRaw && !t.height && !t.cup ? (
                            <span className="line-clamp-1">{t.styleRaw}</span>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        asChild
                        size="sm"
                        className="pointer-events-auto hidden h-8 w-full gap-1.5 px-2 text-xs sm:inline-flex"
                      >
                        <Link
                          href={`/watches/new?therapist_id=${encodeURIComponent(
                            t.id,
                          )}`}
                        >
                          <BellPlusIcon className="size-3.5" />
                          空き通知に追加
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
