import type { Metadata } from "next";
import {
  fetchAvailabilityEventsRecent,
  fetchScraperFreshness,
  EVENT_TYPE_LABEL,
  type AvailabilityEventType,
} from "@/lib/queries/scraper";
import { KpiCard } from "@/components/kpi-card";
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

export const metadata: Metadata = { title: "スクレイパ" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_THRESHOLD_HOURS = 24;
const EVENT_WINDOW_HOURS = 24;

const EVENT_ORDER: AvailabilityEventType[] = [
  "opened",
  "closed",
  "discovered_open",
  "discovered_closed",
];

function StaleBadge({ count }: { count: number }) {
  if (count === 0) {
    return <Badge variant="success">OK</Badge>;
  }
  if (count < 10) {
    return <Badge variant="warning">warn</Badge>;
  }
  return <Badge variant="destructive">stale</Badge>;
}

export default async function ScraperPage() {
  const [freshness, events] = await Promise.all([
    fetchScraperFreshness(STALE_THRESHOLD_HOURS),
    fetchAvailabilityEventsRecent(EVENT_WINDOW_HOURS),
  ]);

  const totalEvents = events.reduce((sum, e) => sum + e.cnt, 0);
  const eventByType = new Map(events.map((e) => [e.event_type, e.cnt]));

  const eventBreakdown = EVENT_ORDER.map((type) => ({
    label: EVENT_TYPE_LABEL[type],
    value: eventByType.get(type) ?? 0,
  }));

  const detailsStale =
    freshness.external_salons_details_never +
    freshness.external_salons_details_stale;
  const bookingsStale =
    freshness.external_salons_bookings_never +
    freshness.external_salons_bookings_stale;
  const salonsSyncStale =
    freshness.salons_last_synced_never + freshness.salons_last_synced_stale;
  const therapistsSyncStale =
    freshness.therapists_last_synced_never +
    freshness.therapists_last_synced_stale;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">スクレイパ健全性</h1>
        <p className="text-sm text-muted-foreground">
          各 *_synced_at の鮮度（しきい値 {STALE_THRESHOLD_HOURS}h）と availability_events
          の直近 {EVENT_WINDOW_HOURS}h 件数
        </p>
      </header>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="直近24h availability_events"
          value={formatNumber(totalEvents)}
          hint="opened / closed / discovered_*"
        />
        <KpiCard
          label="ex_salons.details 未同期/古い"
          value={formatNumber(detailsStale)}
          hint={`/ アクティブ ${formatNumber(freshness.external_salons_total)} (${formatPercent(detailsStale, freshness.external_salons_total)})`}
          tone={detailsStale > 0 ? "warning" : "success"}
        />
        <KpiCard
          label="ex_salons.bookings 未同期/古い"
          value={formatNumber(bookingsStale)}
          hint={`/ アクティブ ${formatNumber(freshness.external_salons_total)} (${formatPercent(bookingsStale, freshness.external_salons_total)})`}
          tone={bookingsStale > 0 ? "warning" : "success"}
        />
        <KpiCard
          label="ex_salons homepage欠落"
          value={formatNumber(freshness.external_salons_homepage_missing)}
          hint={`/ ${formatNumber(freshness.external_salons_total)} (${formatPercent(freshness.external_salons_homepage_missing, freshness.external_salons_total)})`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            同期鮮度の詳細
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>対象</TableHead>
                <TableHead className="text-right">未同期 (NULL)</TableHead>
                <TableHead className="text-right">stale (&gt;{STALE_THRESHOLD_HOURS}h)</TableHead>
                <TableHead className="text-right w-20">判定</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  external_salons.details_synced_at
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.external_salons_details_never)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.external_salons_details_stale)}
                </TableCell>
                <TableCell className="text-right">
                  <StaleBadge count={detailsStale} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  external_salons.bookings_synced_at
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.external_salons_bookings_never)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.external_salons_bookings_stale)}
                </TableCell>
                <TableCell className="text-right">
                  <StaleBadge count={bookingsStale} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  salons.last_synced_at
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.salons_last_synced_never)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.salons_last_synced_stale)}
                </TableCell>
                <TableCell className="text-right">
                  <StaleBadge count={salonsSyncStale} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">
                  therapists.last_synced_at
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.therapists_last_synced_never)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(freshness.therapists_last_synced_stale)}
                </TableCell>
                <TableCell className="text-right">
                  <StaleBadge count={therapistsSyncStale} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            アクティブ件数: salons {formatNumber(freshness.salons_active)} / therapists{" "}
            {formatNumber(freshness.therapists_active)}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            availability_events 直近 {EVENT_WINDOW_HOURS}h 内訳
          </h2>
          {totalEvents > 0 ? (
            <HorizontalBarBreakdown data={eventBreakdown} />
          ) : (
            <p className="text-sm text-muted-foreground">
              直近 {EVENT_WINDOW_HOURS}h にイベントはありません
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
