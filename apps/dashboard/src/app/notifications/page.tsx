import type { Metadata } from "next";
import {
  fetchNotificationsDelay,
  fetchNotificationsFailedTop,
  fetchNotificationsStatusDaily,
  fetchNotificationsSummary,
  type NotificationStatus,
} from "@/lib/queries/notifications";
import { KpiCard } from "@/components/kpi-card";
import { StackedBarChart } from "@/components/stacked-bar-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateJst,
  formatDateTimeJst,
  formatNumber,
  formatRelativeFromNow,
  formatSeconds,
} from "@/lib/format";

export const metadata: Metadata = { title: "通知" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_ORDER: NotificationStatus[] = ["sent", "sending", "pending", "failed"];
const STATUS_LABEL: Record<NotificationStatus, string> = {
  pending: "pending",
  sending: "sending",
  sent: "sent",
  failed: "failed",
};
const STATUS_COLOR: Record<NotificationStatus, string> = {
  sent: "var(--color-chart-2)",
  sending: "var(--color-chart-4)",
  pending: "var(--color-chart-3)",
  failed: "var(--color-destructive)",
};

const WINDOW_HOURS = 24;
const DAILY_DAYS = 7;
const TOP_N = 5;

export default async function NotificationsPage() {
  const [summary, delay, statusDaily, failedTop] = await Promise.all([
    fetchNotificationsSummary(WINDOW_HOURS),
    fetchNotificationsDelay(WINDOW_HOURS),
    fetchNotificationsStatusDaily(DAILY_DAYS),
    fetchNotificationsFailedTop(WINDOW_HOURS, TOP_N),
  ]);

  const daysMap = new Map<string, Record<string, number | string>>();
  for (const row of statusDaily) {
    const key = formatDateJst(row.day).slice(5);
    if (!daysMap.has(key)) {
      daysMap.set(key, { day: key });
    }
    daysMap.get(key)![row.status] = row.cnt;
  }
  const chartData = Array.from(daysMap.values());

  const totalRecent = summary.sent_count + summary.failed_count;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">通知</h1>
        <p className="text-sm text-muted-foreground">
          notification_logs の健全性（直近 {WINDOW_HOURS}h / 日次 {DAILY_DAYS}日）
        </p>
      </header>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="直近24h 送信成功"
          value={formatNumber(summary.sent_count)}
          hint={`失敗 ${formatNumber(summary.failed_count)}`}
          tone="success"
        />
        <KpiCard
          label="成功率"
          value={
            summary.success_rate === null
              ? "-"
              : `${summary.success_rate.toFixed(1)}%`
          }
          hint={`sent / (sent + failed) ${formatNumber(totalRecent)} 件`}
          tone={
            summary.success_rate !== null && summary.success_rate < 95
              ? "warning"
              : "default"
          }
        />
        <KpiCard
          label="pending / sending"
          value={`${formatNumber(summary.pending_count)} / ${formatNumber(summary.sending_count)}`}
          hint={
            summary.oldest_pending_at
              ? `最古: ${formatRelativeFromNow(summary.oldest_pending_at)}`
              : "未処理なし"
          }
          tone={summary.pending_count > 50 ? "warning" : "default"}
        />
        <KpiCard
          label="送信遅延 p50 / p95"
          value={`${formatSeconds(delay.p50_seconds)} / ${formatSeconds(delay.p95_seconds)}`}
          hint={`サンプル ${formatNumber(delay.sample_count)} 件 / 最大 ${formatSeconds(delay.max_seconds)}`}
        />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          日次のステータス内訳（直近 {DAILY_DAYS} 日）
        </h2>
        {chartData.length > 0 ? (
          <StackedBarChart
            data={chartData}
            xKey="day"
            series={STATUS_ORDER.map((status) => ({
              key: status,
              label: STATUS_LABEL[status],
              color: STATUS_COLOR[status],
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">データがありません</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            直近24h の failed 上位 {TOP_N} 件
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>エラー内容</TableHead>
                <TableHead className="text-right w-20">件数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedTop.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    直近 {WINDOW_HOURS}h に failed はありません
                  </TableCell>
                </TableRow>
              ) : (
                failedTop.map((row, idx) => (
                  <TableRow key={`${row.error_text}-${idx}`}>
                    <TableCell className="max-w-md truncate font-mono text-xs">
                      {row.error_text}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.cnt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            送信遅延の詳細
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">サンプル件数</dt>
              <dd className="tabular-nums">{formatNumber(delay.sample_count)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">中央値 (p50)</dt>
              <dd className="tabular-nums">{formatSeconds(delay.p50_seconds)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">p95</dt>
              <dd className="tabular-nums">{formatSeconds(delay.p95_seconds)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">平均</dt>
              <dd className="tabular-nums">{formatSeconds(delay.avg_seconds)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">最大</dt>
              <dd className="tabular-nums">{formatSeconds(delay.max_seconds)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-muted-foreground">最古 pending 時刻</dt>
              <dd className="tabular-nums">
                {formatDateTimeJst(summary.oldest_pending_at)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            遅延 = sent_at - send_after。send_after はプラン別の遅延込みの送信予定時刻なので、
            これがマイナス側に出ない場合は scraper / Resend 側のキュー詰まりを疑う。
          </p>
        </div>
      </section>
    </div>
  );
}
