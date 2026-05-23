import type { Metadata } from "next";
import {
  fetchAreasCoverage,
  fetchExternalSalonsOrphans,
  fetchSalonsCoverage,
  fetchSalonsStatus,
  fetchTherapistsCoverage,
  SALON_STATUS_HINT,
  SALON_STATUS_LABEL,
  SALON_STATUS_ORDER,
  type SalonStatusCategory,
} from "@/lib/queries/coverage";
import { KpiCard } from "@/components/kpi-card";
import { CoverageTable, type CoverageItem } from "@/components/coverage-table";
import { HorizontalBarBreakdown } from "@/components/plan-breakdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "カバレッジ" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ORPHANS_LIMIT = 20;

// 6 つのステータスバケットを HorizontalBarBreakdown で見せる色。
// active 系 = 緑系 / 注意 = オレンジ / 削除済 = 赤系 / 未同期 = グレー。
const STATUS_COLOR: Record<SalonStatusCategory, string> = {
  active_with_therapists: "var(--color-chart-2)",
  active_no_therapists: "#f59e0b",
  stale_synced: "#fbbf24",
  never_synced: "#9ca3af",
  closed_external: "#ef4444",
  closed_internal: "#6b7280",
};

export default async function CoveragePage() {
  const [salonsCov, salonStatus, therapistsCov, areas, orphans] =
    await Promise.all([
      fetchSalonsCoverage(),
      fetchSalonsStatus(),
      fetchTherapistsCoverage(),
      fetchAreasCoverage(),
      fetchExternalSalonsOrphans(ORPHANS_LIMIT),
    ]);

  const statusByCategory = new Map(salonStatus.map((r) => [r.category, r.cnt]));
  const statusBreakdown = SALON_STATUS_ORDER.map((category) => ({
    label: SALON_STATUS_LABEL[category],
    value: statusByCategory.get(category) ?? 0,
    color: STATUS_COLOR[category],
  }));

  // ----- salons の各項目カバレッジ -----
  // 自社マスタ + リンク経由で補完できた値 + 外部側全体 を 3 グループに分けて見せる
  const salonsSelfItems: CoverageItem[] = [
    {
      label: "url",
      hint: "予約ページURL",
      filled: salonsCov.salons_with_url,
      total: salonsCov.salons_active,
    },
    {
      label: "homepage_url",
      hint: "公式サイトURL",
      filled: salonsCov.salons_with_homepage_url,
      total: salonsCov.salons_active,
    },
    {
      label: "external_salon_id",
      hint: "men-estheへのリンク",
      filled: salonsCov.salons_linked_external,
      total: salonsCov.salons_active,
    },
  ];

  const salonsLinkedEnrichItems: CoverageItem[] = [
    {
      label: "prefecture",
      filled: salonsCov.linked_with_prefecture,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "areas",
      hint: "エリア配列",
      filled: salonsCov.linked_with_areas,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "nearest_stations",
      filled: salonsCov.linked_with_nearest_stations,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "genre",
      filled: salonsCov.linked_with_genre,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "price_range",
      filled: salonsCov.linked_with_price_range,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "opening_hours",
      filled: salonsCov.linked_with_opening_hours,
      total: salonsCov.linked_external_salons_active,
    },
    {
      label: "homepage_url",
      hint: "ポータル側",
      filled: salonsCov.linked_with_homepage_url,
      total: salonsCov.linked_external_salons_active,
    },
  ];

  const externalSalonsItems: CoverageItem[] = [
    {
      label: "prefecture",
      filled: salonsCov.ex_with_prefecture,
      total: salonsCov.ex_active,
    },
    {
      label: "areas",
      filled: salonsCov.ex_with_areas,
      total: salonsCov.ex_active,
    },
    {
      label: "nearest_stations",
      filled: salonsCov.ex_with_nearest_stations,
      total: salonsCov.ex_active,
    },
    {
      label: "genre",
      filled: salonsCov.ex_with_genre,
      total: salonsCov.ex_active,
    },
    {
      label: "price_range",
      filled: salonsCov.ex_with_price_range,
      total: salonsCov.ex_active,
    },
    {
      label: "opening_hours",
      filled: salonsCov.ex_with_opening_hours,
      total: salonsCov.ex_active,
    },
    {
      label: "homepage_url",
      filled: salonsCov.ex_with_homepage_url,
      total: salonsCov.ex_active,
    },
    {
      label: "bookings",
      hint: "予約システム検出済",
      filled: salonsCov.ex_with_bookings,
      total: salonsCov.ex_active,
    },
  ];

  // ----- therapists の各項目カバレッジ -----
  const therapistsSelfItems: CoverageItem[] = [
    {
      label: "profile_url",
      filled: therapistsCov.t_with_profile_url,
      total: therapistsCov.therapists_active,
    },
    {
      label: "image_url",
      filled: therapistsCov.t_with_image_url,
      total: therapistsCov.therapists_active,
    },
    {
      label: "description",
      filled: therapistsCov.t_with_description,
      total: therapistsCov.therapists_active,
    },
    {
      label: "age",
      filled: therapistsCov.t_with_age,
      total: therapistsCov.therapists_active,
    },
    {
      label: "height",
      filled: therapistsCov.t_with_height,
      total: therapistsCov.therapists_active,
    },
    {
      label: "B/W/H",
      hint: "3 項目すべて",
      filled: therapistsCov.t_with_bwh,
      total: therapistsCov.therapists_active,
    },
    {
      label: "cup",
      filled: therapistsCov.t_with_cup,
      total: therapistsCov.therapists_active,
    },
    {
      label: "external_therapist_id",
      hint: "men-estheへのリンク",
      filled: therapistsCov.t_linked_external,
      total: therapistsCov.therapists_active,
    },
  ];

  const therapistsLinkedItems: CoverageItem[] = [
    {
      label: "age",
      filled: therapistsCov.linked_with_age,
      total: therapistsCov.linked_total,
    },
    {
      label: "height",
      filled: therapistsCov.linked_with_height,
      total: therapistsCov.linked_total,
    },
    {
      label: "cup",
      filled: therapistsCov.linked_with_cup,
      total: therapistsCov.linked_total,
    },
    {
      label: "image_urls",
      filled: therapistsCov.linked_with_image,
      total: therapistsCov.linked_total,
    },
    {
      label: "therapist_url",
      hint: "Stage 5 対象",
      filled: therapistsCov.linked_with_therapist_url,
      total: therapistsCov.linked_total,
    },
    {
      label: "comment",
      filled: therapistsCov.linked_with_comment,
      total: therapistsCov.linked_total,
    },
  ];

  const externalTherapistsItems: CoverageItem[] = [
    {
      label: "age",
      filled: therapistsCov.ex_with_age,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "height",
      filled: therapistsCov.ex_with_height,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "cup",
      filled: therapistsCov.ex_with_cup,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "image_urls",
      filled: therapistsCov.ex_with_image,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "therapist_url",
      filled: therapistsCov.ex_with_therapist_url,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "comment",
      filled: therapistsCov.ex_with_comment,
      total: therapistsCov.external_therapists_active,
    },
    {
      label: "kana",
      filled: therapistsCov.ex_with_kana,
      total: therapistsCov.external_therapists_active,
    },
  ];

  const linkedSalonsRate = formatPercent(
    salonsCov.salons_linked_external,
    salonsCov.salons_active,
  );
  const linkedTherapistsRate = formatPercent(
    therapistsCov.t_linked_external,
    therapistsCov.therapists_active,
  );

  const closedSuspect = statusByCategory.get("active_no_therapists") ?? 0;
  const staleSalons = statusByCategory.get("stale_synced") ?? 0;
  const closedExternal = statusByCategory.get("closed_external") ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">カバレッジ</h1>
        <p className="text-sm text-muted-foreground">
          salons / external_salons / therapists / external_therapists
          の項目カバレッジとサロン状況の分類
        </p>
      </header>

      {/* ===================================================== */}
      {/* サロンの全体感 */}
      {/* ===================================================== */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">サロン全体</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="salons (active)"
            value={formatNumber(salonsCov.salons_active)}
            hint={`linked ${linkedSalonsRate}`}
          />
          <KpiCard
            label="external_salons (active)"
            value={formatNumber(salonsCov.ex_active)}
            hint={`予約システム判明 ${formatPercent(salonsCov.ex_with_bookings, salonsCov.ex_active)}`}
          />
          <KpiCard
            label="閉店疑い"
            value={formatNumber(closedSuspect)}
            hint="active なのにセラピスト 0"
            tone={closedSuspect > 0 ? "warning" : "default"}
          />
          <KpiCard
            label="同期停滞"
            value={formatNumber(staleSalons)}
            hint={`/ 外部側削除 ${formatNumber(closedExternal)}`}
            tone={staleSalons > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* ===================================================== */}
      {/* サロンステータス分類 */}
      {/* ===================================================== */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            サロンステータス分類 (6 バケット排他)
          </h2>
          <HorizontalBarBreakdown data={statusBreakdown} height={240} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            分類定義
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>カテゴリ</TableHead>
                <TableHead className="text-right w-20">件数</TableHead>
                <TableHead>判定条件</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SALON_STATUS_ORDER.map((category) => (
                <TableRow key={category}>
                  <TableCell className="font-medium">
                    {SALON_STATUS_LABEL[category]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(statusByCategory.get(category) ?? 0)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {SALON_STATUS_HINT[category]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ===================================================== */}
      {/* salons / external_salons 項目別カバレッジ */}
      {/* ===================================================== */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">salons (自社マスタ)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = active salons {formatNumber(salonsCov.salons_active)}
          </p>
          <CoverageTable items={salonsSelfItems} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">
            リンク済 salons から補完
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = linked salons 経由で取得できる external_salons{" "}
            {formatNumber(salonsCov.linked_external_salons_active)}
          </p>
          <CoverageTable items={salonsLinkedEnrichItems} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">
            external_salons (men-esthe.jp 全体)
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = active external_salons{" "}
            {formatNumber(salonsCov.ex_active)}
          </p>
          <CoverageTable items={externalSalonsItems} />
        </div>
      </section>

      {/* ===================================================== */}
      {/* セラピスト全体感 */}
      {/* ===================================================== */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">セラピスト全体</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="therapists (active)"
            value={formatNumber(therapistsCov.therapists_active)}
            hint={`linked ${linkedTherapistsRate}`}
          />
          <KpiCard
            label="external_therapists (active)"
            value={formatNumber(therapistsCov.external_therapists_active)}
            hint={`status=1 ${formatNumber(therapistsCov.ex_status_active)} / status=2 ${formatNumber(therapistsCov.ex_status_retired)}`}
          />
          <KpiCard
            label="未同期 therapists"
            value={formatNumber(therapistsCov.t_never_synced)}
            hint="last_synced_at NULL (= availability 未取得)"
            tone={therapistsCov.t_never_synced > 0 ? "warning" : "default"}
          />
          <KpiCard
            label="同期停滞 therapists"
            value={formatNumber(therapistsCov.t_stale_synced)}
            hint="last_synced_at > 7d"
            tone={therapistsCov.t_stale_synced > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* ===================================================== */}
      {/* therapists / external_therapists 項目別カバレッジ */}
      {/* ===================================================== */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">therapists (自社マスタ)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = active therapists{" "}
            {formatNumber(therapistsCov.therapists_active)}
          </p>
          <CoverageTable items={therapistsSelfItems} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">
            リンク済 therapists から補完
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = linked therapists{" "}
            {formatNumber(therapistsCov.linked_total)}
          </p>
          <CoverageTable items={therapistsLinkedItems} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium mb-1">
            external_therapists (men-esthe.jp 全体)
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            母数 = active external_therapists{" "}
            {formatNumber(therapistsCov.external_therapists_active)}
          </p>
          <CoverageTable items={externalTherapistsItems} />
        </div>
      </section>

      {/* ===================================================== */}
      {/* エリア別カバレッジ */}
      {/* ===================================================== */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-1">
          都道府県別カバレッジ
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          external_salons.prefecture を軸に、自社 salons にリンクできているものの比率を見る
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>都道府県</TableHead>
              <TableHead className="text-right">external 件数</TableHead>
              <TableHead className="text-right">link 済</TableHead>
              <TableHead className="text-right">未 link</TableHead>
              <TableHead className="text-right w-20">link率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  データがありません
                </TableCell>
              </TableRow>
            ) : (
              areas.map((row) => (
                <TableRow key={row.prefecture}>
                  <TableCell className="font-medium">
                    {row.prefecture}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.external_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.linked_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.unlinked_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(row.linked_count, row.external_count)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* ===================================================== */}
      {/* 取りこぼし候補 (Orphan external_salons) */}
      {/* ===================================================== */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-1">
          自社 salons 未投入の外部サロン候補 (TOP {ORPHANS_LIMIT})
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          external_salon_bookings に予約システム URL が判明している
          のに自社 salons へのリンクがない external_salons。bookings 件数の
          多い順 (= 複数予約システム併用 = 規模大) で並べる
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>サロン名</TableHead>
              <TableHead>都道府県</TableHead>
              <TableHead>予約システム</TableHead>
              <TableHead className="text-right w-16">件数</TableHead>
              <TableHead>リンク</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orphans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  追加候補なし
                </TableCell>
              </TableRow>
            ) : (
              orphans.map((row) => (
                <TableRow key={row.external_salon_id}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.prefecture ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.site_names.map((s) => (
                        <Badge key={s} variant="secondary">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.bookings_count)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      {row.homepage_url ? (
                        <a
                          href={row.homepage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 text-foreground/80 hover:text-foreground truncate max-w-xs"
                        >
                          公式
                        </a>
                      ) : null}
                      {row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 text-muted-foreground hover:text-foreground truncate max-w-xs"
                        >
                          men-esthe
                        </a>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
