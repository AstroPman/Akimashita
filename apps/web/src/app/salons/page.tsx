import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/landing/site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import {
  getPublicSalons,
  searchPublicTherapists,
  PUBLIC_THERAPIST_SEARCH_DEFAULT_LIMIT,
  type PublicSalon,
} from "@/lib/salons";
import {
  PublicSearchForm,
  type AreaGroup,
} from "./_components/public-search-form";
import { SalonResultList } from "./_components/salon-result-list";
import { TherapistResultList } from "./_components/therapist-result-list";

type SalonsSearchParams = {
  salon?: string;
  therapist?: string;
  area?: string;
  page?: string;
};

interface PageProps {
  searchParams: Promise<SalonsSearchParams>;
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

function normalizeQuery(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

function buildAreaGroups(salons: PublicSalon[]): AreaGroup[] {
  const map = new Map<string, Set<string>>();
  for (const s of salons) {
    if (!s.prefecture) continue;
    for (const a of s.areas ?? []) {
      if (!map.has(s.prefecture)) map.set(s.prefecture, new Set());
      map.get(s.prefecture)!.add(a);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([prefecture, areas]) => ({
      prefecture,
      areas: [...areas].sort((a, b) => a.localeCompare(b, "ja")),
    }));
}

function filterSalons(
  salons: PublicSalon[],
  filters: { salon: string; area: string },
): PublicSalon[] {
  const salonQ = filters.salon.toLowerCase();
  const area = filters.area;
  return salons.filter((s) => {
    if (area && !s.areas.includes(area)) return false;
    if (salonQ && !s.name.toLowerCase().includes(salonQ)) return false;
    return true;
  });
}

function buildCanonicalUrl(params: SalonsSearchParams): string {
  const qs = new URLSearchParams();
  const salon = normalizeQuery(params.salon);
  const therapist = normalizeQuery(params.therapist);
  const area = normalizeQuery(params.area);
  const page = parsePage(params.page);
  if (salon) qs.set("salon", salon);
  if (therapist) qs.set("therapist", therapist);
  if (area) qs.set("area", area);
  if (page > 1) qs.set("page", String(page));
  const suffix = qs.toString();
  return `${SITE_URL}/salons${suffix ? `?${suffix}` : ""}`;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const salon = normalizeQuery(sp.salon);
  const therapist = normalizeQuery(sp.therapist);
  const area = normalizeQuery(sp.area);
  const canonical = buildCanonicalUrl(sp);

  const titleParts: string[] = [];
  if (therapist) titleParts.push(`「${therapist}」のセラピスト検索`);
  else if (salon) titleParts.push(`「${salon}」のサロン検索`);
  else titleParts.push("対応サロン・セラピスト検索");
  if (area) titleParts.push(area);

  const title = titleParts.join(" / ");

  const descSegments: string[] = [];
  if (therapist || salon) {
    descSegments.push(
      `${therapist ? `セラピスト「${therapist}」` : ""}${
        salon ? `サロン「${salon}」` : ""
      }${area ? ` (${area})` : ""}の検索結果。`,
    );
  } else {
    descSegments.push(
      "アキマシタが空き通知に対応しているサロンとセラピストを横断検索できます。",
    );
  }
  descSegments.push(
    "気になるセラピストを登録すると、空き枠が出た瞬間にメール通知します。",
  );

  return {
    title,
    description: descSegments.join(" "),
    alternates: { canonical },
    openGraph: {
      title,
      description: descSegments.join(" "),
      url: canonical,
      type: "website",
    },
  };
}

export default async function SalonsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const salonQ = normalizeQuery(sp.salon);
  const therapistQ = normalizeQuery(sp.therapist);
  const area = normalizeQuery(sp.area);
  const page = parsePage(sp.page);

  const salons = await getPublicSalons();
  const areaGroups = buildAreaGroups(salons);

  const isTherapistMode = therapistQ.length > 0;

  const limit = PUBLIC_THERAPIST_SEARCH_DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  const [filteredSalons, therapistResult] = await Promise.all([
    Promise.resolve(filterSalons(salons, { salon: salonQ, area })),
    isTherapistMode
      ? searchPublicTherapists({
          salon: salonQ || null,
          therapist: therapistQ,
          area: area || null,
          limit,
          offset,
        })
      : Promise.resolve(null),
  ]);

  const totalSalonCount = salons.length;
  const buildHref = (overrides: Partial<SalonsSearchParams>) => {
    const next = new URLSearchParams();
    const v = { ...sp, ...overrides };
    if (normalizeQuery(v.salon)) next.set("salon", normalizeQuery(v.salon));
    if (normalizeQuery(v.therapist))
      next.set("therapist", normalizeQuery(v.therapist));
    if (normalizeQuery(v.area)) next.set("area", normalizeQuery(v.area));
    const p = parsePage(v.page);
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return qs ? `/salons?${qs}` : "/salons";
  };

  return (
    <div className="flex flex-1 flex-col">
      <PublicSiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-12">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              サロン・セラピストを探す
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
              アキマシタが空き通知に対応しているサロンとセラピストを横断検索できます。
              気になるセラピストを登録すると、空きが出た瞬間にメール通知します。
            </p>
          </div>

          <div className="mt-6">
            <PublicSearchForm
              // URL params が変わったら remount して入力値を初期化する
              key={`${salonQ}|${therapistQ}|${area}`}
              initial={{ salon: salonQ, therapist: therapistQ, area }}
              areaGroups={areaGroups}
            />
          </div>

          <div className="mt-8 space-y-4">
            {isTherapistMode && therapistResult ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    セラピスト検索結果
                  </h2>
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {therapistResult.totalCount.toLocaleString("ja-JP")} 件中{" "}
                    {therapistResult.items.length === 0
                      ? "0"
                      : `${(offset + 1).toLocaleString("ja-JP")}–${(
                          offset + therapistResult.items.length
                        ).toLocaleString("ja-JP")}`}{" "}
                    件を表示
                  </p>
                </div>

                <TherapistResultList therapists={therapistResult.items} />

                <Pagination
                  page={page}
                  pageSize={limit}
                  total={therapistResult.totalCount}
                  buildHref={(p) => buildHref({ page: String(p) })}
                />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    対応サロン一覧
                  </h2>
                  <p
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {filteredSalons.length === totalSalonCount
                      ? `全 ${totalSalonCount.toLocaleString("ja-JP")} 件を表示`
                      : `${filteredSalons.length.toLocaleString(
                          "ja-JP",
                        )} 件が該当 (全 ${totalSalonCount.toLocaleString(
                          "ja-JP",
                        )} 件)`}
                  </p>
                </div>
                <SalonResultList salons={filteredSalons} />
              </>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  buildHref,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  return (
    <nav
      className="flex items-center justify-center gap-3 pt-2"
      aria-label="ページネーション"
    >
      <Button
        asChild={hasPrev}
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        aria-disabled={!hasPrev}
      >
        {hasPrev ? (
          <Link href={buildHref(page - 1)} rel="prev">
            前へ
          </Link>
        ) : (
          <span>前へ</span>
        )}
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        asChild={hasNext}
        variant="outline"
        size="sm"
        disabled={!hasNext}
        aria-disabled={!hasNext}
      >
        {hasNext ? (
          <Link href={buildHref(page + 1)} rel="next">
            次へ
          </Link>
        ) : (
          <span>次へ</span>
        )}
      </Button>
    </nav>
  );
}
