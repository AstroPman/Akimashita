import type { Metadata } from "next";
import {
  fetchUserPlanBreakdown,
  fetchUsersDaily,
  PLAN_LABEL,
  type PlanTier,
} from "@/lib/queries/users";
import { KpiCard } from "@/components/kpi-card";
import { PeriodSelector, parseRange } from "@/components/period-selector";
import { TimeSeriesChart } from "@/components/time-series-chart";
import { HorizontalBarBreakdown } from "@/components/plan-breakdown";
import { formatNumber, formatPercent, formatDateJst } from "@/lib/format";

export const metadata: Metadata = { title: "ユーザ" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLAN_ORDER: PlanTier[] = ["free", "standard", "premium"];

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function UsersPage({ searchParams }: PageProps) {
  const { range } = await searchParams;
  const days = parseRange(range);

  const [daily, breakdown] = await Promise.all([
    fetchUsersDaily(days),
    fetchUserPlanBreakdown(),
  ]);

  const byTier = new Map(breakdown.map((b) => [b.plan_tier, b.user_count]));
  const totalActive = breakdown.reduce((sum, b) => sum + b.user_count, 0);

  const breakdownData = PLAN_ORDER.map((tier) => ({
    label: PLAN_LABEL[tier],
    value: byTier.get(tier) ?? 0,
  }));

  const chartData = daily.map((row) => ({
    day: formatDateJst(row.day).slice(5),
    cumulative: row.cumulative_users,
    new_users: row.new_users,
    deleted_users: row.deleted_users,
  }));

  const latest = daily[daily.length - 1];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ユーザ</h1>
          <p className="text-sm text-muted-foreground">
            登録ユーザ数とプラン別内訳、累積推移
          </p>
        </div>
        <PeriodSelector basePath="/users" current={days} />
      </header>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="現在のユーザ総数"
          value={formatNumber(totalActive)}
          hint="deleted_at IS NULL のユーザ"
        />
        {PLAN_ORDER.map((tier) => {
          const count = byTier.get(tier) ?? 0;
          return (
            <KpiCard
              key={tier}
              label={`${PLAN_LABEL[tier]}プラン`}
              value={formatNumber(count)}
              hint={formatPercent(count, totalActive)}
            />
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            累積ユーザ数の推移（直近 {days} 日）
          </h2>
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
            />
          ) : (
            <p className="text-sm text-muted-foreground">データがありません</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            プラン別内訳
          </h2>
          <HorizontalBarBreakdown data={breakdownData} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          日次の新規 / 退会
        </h2>
        {chartData.length > 0 ? (
          <TimeSeriesChart
            data={chartData}
            xKey="day"
            series={[
              {
                key: "new_users",
                label: "新規",
                color: "var(--color-chart-2)",
              },
              {
                key: "deleted_users",
                label: "退会",
                color: "var(--color-chart-4)",
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">データがありません</p>
        )}
        {latest ? (
          <p className="mt-2 text-xs text-muted-foreground">
            最新日 ({formatDateJst(latest.day)}): 新規 {latest.new_users} / 退会{" "}
            {latest.deleted_users}
          </p>
        ) : null}
      </section>
    </div>
  );
}
