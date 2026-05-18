import type { Metadata } from "next";
import Link from "next/link";
import {
  fetchUserPlanBreakdown,
  fetchUsersDaily,
  PLAN_LABEL,
  type PlanTier,
} from "@/lib/queries/users";
import { fetchTablesOverview } from "@/lib/queries/tables";
import { fetchNotificationsSummary } from "@/lib/queries/notifications";
import { fetchScraperFreshness } from "@/lib/queries/scraper";
import { KpiCard } from "@/components/kpi-card";
import { TimeSeriesChart } from "@/components/time-series-chart";
import {
  formatDateJst,
  formatNumber,
  formatPercent,
  formatRelativeFromNow,
} from "@/lib/format";

export const metadata: Metadata = { title: "概要" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLAN_ORDER: PlanTier[] = ["free", "standard", "premium"];

export default async function HomePage() {
  const [planBreakdown, daily, overview, notif, freshness] = await Promise.all([
    fetchUserPlanBreakdown(),
    fetchUsersDaily(30),
    fetchTablesOverview(),
    fetchNotificationsSummary(24),
    fetchScraperFreshness(24),
  ]);

  const byTier = new Map(planBreakdown.map((b) => [b.plan_tier, b.user_count]));
  const totalUsers = planBreakdown.reduce((sum, b) => sum + b.user_count, 0);

  const chartData = daily.map((row) => ({
    day: formatDateJst(row.day).slice(5),
    cumulative: row.cumulative_users,
  }));

  const salonsLinkRate = formatPercent(
    overview.salons_linked,
    overview.salons_active,
  );
  const therapistsLinkRate = formatPercent(
    overview.therapists_linked,
    overview.therapists_active,
  );

  const stalest =
    freshness.external_salons_details_never +
    freshness.external_salons_details_stale +
    freshness.external_salons_bookings_never +
    freshness.external_salons_bookings_stale +
    freshness.salons_last_synced_never +
    freshness.salons_last_synced_stale +
    freshness.therapists_last_synced_never +
    freshness.therapists_last_synced_stale;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">概要</h1>
        <p className="text-sm text-muted-foreground">
          各ページの主要 KPI を横断表示（本番Supabaseに直結）
        </p>
      </header>

      <SectionLink
        href="/users"
        title="ユーザ"
        subtitle={`現在 ${formatNumber(totalUsers)} 名`}
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="総ユーザ数"
            value={formatNumber(totalUsers)}
            hint="deleted_at IS NULL"
          />
          {PLAN_ORDER.map((tier) => {
            const count = byTier.get(tier) ?? 0;
            return (
              <KpiCard
                key={tier}
                label={`${PLAN_LABEL[tier]}プラン`}
                value={formatNumber(count)}
                hint={formatPercent(count, totalUsers)}
              />
            );
          })}
        </div>
        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-2">
            累積ユーザ数の推移（直近 30 日）
          </p>
          {chartData.length > 0 ? (
            <TimeSeriesChart
              data={chartData}
              xKey="day"
              series={[
                {
                  key: "cumulative",
                  label: "累積ユーザ",
                  color: "var(--color-chart-1)",
                },
              ]}
              height={200}
            />
          ) : (
            <p className="text-sm text-muted-foreground">データがありません</p>
          )}
        </div>
      </SectionLink>

      <SectionLink
        href="/tables"
        title="テーブル集計"
        subtitle={`linked: salons ${salonsLinkRate} / therapists ${therapistsLinkRate}`}
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="external_salons"
            value={formatNumber(overview.external_salons_active)}
            hint={`累計 ${formatNumber(overview.external_salons_total)}`}
          />
          <KpiCard
            label="external_therapists"
            value={formatNumber(overview.external_therapists_active)}
            hint={`累計 ${formatNumber(overview.external_therapists_total)}`}
          />
          <KpiCard
            label="link済 salons"
            value={formatNumber(overview.salons_linked)}
            hint={`${salonsLinkRate} / 全 ${formatNumber(overview.salons_active)}`}
          />
          <KpiCard
            label="link済 therapists"
            value={formatNumber(overview.therapists_linked)}
            hint={`${therapistsLinkRate} / 全 ${formatNumber(overview.therapists_active)}`}
          />
        </div>
      </SectionLink>

      <SectionLink
        href="/notifications"
        title="通知（直近 24h）"
        subtitle={
          notif.success_rate === null
            ? "送信履歴なし"
            : `成功率 ${notif.success_rate.toFixed(1)}%`
        }
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="sent"
            value={formatNumber(notif.sent_count)}
            tone="success"
          />
          <KpiCard
            label="failed"
            value={formatNumber(notif.failed_count)}
            tone={notif.failed_count > 0 ? "destructive" : "default"}
          />
          <KpiCard
            label="pending / sending"
            value={`${formatNumber(notif.pending_count)} / ${formatNumber(notif.sending_count)}`}
          />
          <KpiCard
            label="最古 pending"
            value={
              notif.oldest_pending_at
                ? formatRelativeFromNow(notif.oldest_pending_at)
                : "なし"
            }
            tone={notif.pending_count > 50 ? "warning" : "default"}
          />
        </div>
      </SectionLink>

      <SectionLink
        href="/scraper"
        title="スクレイパ健全性"
        subtitle={
          stalest === 0 ? "stale 0件" : `合計 ${formatNumber(stalest)} 件の stale`
        }
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="ex_salons details stale"
            value={formatNumber(
              freshness.external_salons_details_never +
                freshness.external_salons_details_stale,
            )}
            hint={`/ ${formatNumber(freshness.external_salons_total)}`}
            tone={
              freshness.external_salons_details_stale > 0 ? "warning" : "default"
            }
          />
          <KpiCard
            label="ex_salons bookings stale"
            value={formatNumber(
              freshness.external_salons_bookings_never +
                freshness.external_salons_bookings_stale,
            )}
            hint={`/ ${formatNumber(freshness.external_salons_total)}`}
            tone={
              freshness.external_salons_bookings_stale > 0
                ? "warning"
                : "default"
            }
          />
          <KpiCard
            label="salons.last_synced stale"
            value={formatNumber(
              freshness.salons_last_synced_never +
                freshness.salons_last_synced_stale,
            )}
            hint={`/ ${formatNumber(freshness.salons_active)}`}
          />
          <KpiCard
            label="therapists.last_synced stale"
            value={formatNumber(
              freshness.therapists_last_synced_never +
                freshness.therapists_last_synced_stale,
            )}
            hint={`/ ${formatNumber(freshness.therapists_active)}`}
          />
        </div>
      </SectionLink>
    </div>
  );
}

function SectionLink({
  href,
  title,
  subtitle,
  children,
}: {
  href: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <Link
          href={href}
          className="text-lg font-medium hover:underline underline-offset-4"
        >
          {title}
        </Link>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
        <Link
          href={href}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          詳細 →
        </Link>
      </div>
      {children}
    </section>
  );
}
