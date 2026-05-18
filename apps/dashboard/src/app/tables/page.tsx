import type { Metadata } from "next";
import {
  fetchExternalSalonsDaily,
  fetchExternalTherapistsDaily,
  fetchSitesBreakdown,
  fetchTablesOverview,
} from "@/lib/queries/tables";
import { KpiCard } from "@/components/kpi-card";
import { PeriodSelector, parseRange } from "@/components/period-selector";
import { TimeSeriesChart } from "@/components/time-series-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateJst, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "テーブル集計" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function TablesPage({ searchParams }: PageProps) {
  const { range } = await searchParams;
  const days = parseRange(range);

  const [overview, salonsDaily, therapistsDaily, sites] = await Promise.all([
    fetchTablesOverview(),
    fetchExternalSalonsDaily(days),
    fetchExternalTherapistsDaily(days),
    fetchSitesBreakdown(),
  ]);

  const salonsChart = salonsDaily.map((row) => ({
    day: formatDateJst(row.day).slice(5),
    total: row.cumulative_total,
    active: row.cumulative_active,
  }));
  const therapistsChart = therapistsDaily.map((row) => ({
    day: formatDateJst(row.day).slice(5),
    total: row.cumulative_total,
    active: row.cumulative_active,
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">テーブル集計</h1>
          <p className="text-sm text-muted-foreground">
            external_* テーブル件数の推移と、自社マスタとのリンク状況
          </p>
        </div>
        <PeriodSelector basePath="/tables" current={days} />
      </header>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="external_salons (アクティブ)"
          value={formatNumber(overview.external_salons_active)}
          hint={`累計 ${formatNumber(overview.external_salons_total)} 件`}
        />
        <KpiCard
          label="external_therapists (アクティブ)"
          value={formatNumber(overview.external_therapists_active)}
          hint={`累計 ${formatNumber(overview.external_therapists_total)} 件`}
        />
        <KpiCard
          label="link済 salons"
          value={formatNumber(overview.salons_linked)}
          hint={`${formatPercent(overview.salons_linked, overview.salons_active)} / 全 ${formatNumber(overview.salons_active)} 件`}
        />
        <KpiCard
          label="link済 therapists"
          value={formatNumber(overview.therapists_linked)}
          hint={`${formatPercent(overview.therapists_linked, overview.therapists_active)} / 全 ${formatNumber(overview.therapists_active)} 件`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            external_salons 累積推移
          </h2>
          {salonsChart.length > 0 ? (
            <TimeSeriesChart
              data={salonsChart}
              xKey="day"
              series={[
                {
                  key: "active",
                  label: "アクティブ",
                  color: "var(--color-chart-1)",
                },
                {
                  key: "total",
                  label: "累計",
                  color: "var(--color-chart-3)",
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">データがありません</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            external_therapists 累積推移
          </h2>
          {therapistsChart.length > 0 ? (
            <TimeSeriesChart
              data={therapistsChart}
              xKey="day"
              series={[
                {
                  key: "active",
                  label: "アクティブ",
                  color: "var(--color-chart-2)",
                },
                {
                  key: "total",
                  label: "累計",
                  color: "var(--color-chart-4)",
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">データがありません</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          サイト別内訳（salons / therapists）
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>サイト</TableHead>
              <TableHead className="text-right">salons (active)</TableHead>
              <TableHead className="text-right">salons (linked)</TableHead>
              <TableHead className="text-right">therapists (active)</TableHead>
              <TableHead className="text-right">therapists (linked)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  データがありません
                </TableCell>
              </TableRow>
            ) : (
              sites.map((site) => (
                <TableRow key={site.site_name}>
                  <TableCell className="font-medium">{site.site_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(site.salons_active)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(site.salons_linked)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatPercent(site.salons_linked, site.salons_active)})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(site.therapists_active)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(site.therapists_linked)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (
                      {formatPercent(
                        site.therapists_linked,
                        site.therapists_active,
                      )}
                      )
                    </span>
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
