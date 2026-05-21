import type { Metadata } from "next";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  fetchAvailabilityEventsFeed,
  fetchAvailabilityEventsSummary,
  fetchStaleOpenBySalon,
  fetchStaleOpenOverview,
  fetchStaleOpenSlotsList,
  isAvailabilityEventType,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_TONE,
  EVENT_TYPE_VALUES,
  type AvailabilityEventType,
} from "@/lib/queries/availability";
import { KpiCard } from "@/components/kpi-card";
import {
  EventTypeSelector,
  HoursSelector,
  parseHours,
} from "@/components/availability-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  formatDateJst,
  formatDateTimeJst,
  formatNumber,
} from "@/lib/format";

dayjs.extend(utc);
dayjs.extend(timezone);

export const metadata: Metadata = { title: "予約枠" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_PATH = "/availability";
const FEED_LIMIT = 200;
const BY_SALON_LIMIT = 20;
const STALE_LIST_LIMIT = 50;

interface PageProps {
  searchParams: Promise<{
    hours?: string;
    event_type?: string;
    salon_id?: string;
    therapist_id?: string;
  }>;
}

function staleDaysFromToday(slotDate: string): number {
  const today = dayjs().tz("Asia/Tokyo").startOf("day");
  const target = dayjs.tz(slotDate, "Asia/Tokyo").startOf("day");
  return today.diff(target, "day");
}

function formatStartTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const hours = parseHours(sp.hours);
  const eventType: AvailabilityEventType | undefined = isAvailabilityEventType(
    sp.event_type,
  )
    ? sp.event_type
    : undefined;
  const salonId = sp.salon_id || undefined;
  const therapistId = sp.therapist_id || undefined;

  const currentSp: Record<string, string | undefined> = {
    hours: String(hours),
    event_type: eventType,
    salon_id: salonId,
    therapist_id: therapistId,
  };

  const [summary, feed, staleOverview, staleBySalon, staleList] =
    await Promise.all([
      fetchAvailabilityEventsSummary(hours),
      fetchAvailabilityEventsFeed({
        hours,
        limit: FEED_LIMIT,
        eventTypes: eventType ? [eventType] : undefined,
        salonId,
        therapistId,
      }),
      fetchStaleOpenOverview(),
      fetchStaleOpenBySalon(BY_SALON_LIMIT),
      fetchStaleOpenSlotsList(STALE_LIST_LIMIT),
    ]);

  const summaryByType = new Map(summary.map((r) => [r.event_type, r.cnt]));
  const totalEvents = summary.reduce((sum, r) => sum + r.cnt, 0);

  const drillFilterActive = Boolean(salonId || therapistId);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">予約枠</h1>
          <p className="text-sm text-muted-foreground">
            availability_events の状態遷移ログと、過去日付なのに空き続けている枠の検出
          </p>
        </div>
        <HoursSelector
          basePath={BASE_PATH}
          current={hours}
          searchParams={currentSp}
        />
      </header>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {EVENT_TYPE_VALUES.map((type) => (
          <KpiCard
            key={type}
            label={EVENT_TYPE_LABEL[type]}
            value={formatNumber(summaryByType.get(type) ?? 0)}
            hint={`直近 ${hours}h`}
            tone={EVENT_TYPE_TONE[type]}
          />
        ))}
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              予約枠の状態遷移ログ
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              直近 {hours}h / 最大 {FEED_LIMIT} 件・新しい順
              {drillFilterActive ? "・URL クエリで個別フィルタ適用中" : ""}
            </p>
          </div>
          <EventTypeSelector
            basePath={BASE_PATH}
            current={eventType}
            searchParams={currentSp}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">発生時刻 (JST)</TableHead>
              <TableHead className="w-36">種別</TableHead>
              <TableHead className="w-20">サイト</TableHead>
              <TableHead>サロン</TableHead>
              <TableHead>セラピスト</TableHead>
              <TableHead className="w-32">対象スロット</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feed.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  該当するイベントはありません
                </TableCell>
              </TableRow>
            ) : (
              feed.map((row, idx) => (
                <TableRow
                  key={`${row.therapist_id}-${row.slot_date}-${row.start_time}-${row.occurred_at}-${idx}`}
                >
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatDateTimeJst(row.occurred_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={EVENT_TYPE_TONE[row.event_type]}>
                      {EVENT_TYPE_LABEL[row.event_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {row.site_name}
                  </TableCell>
                  <TableCell className="text-sm">{row.salon_name}</TableCell>
                  <TableCell className="text-sm">{row.therapist_name}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-xs">
                    {formatDateJst(row.slot_date)} {formatStartTime(row.start_time)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">
            過去日付なのに空き続けている枠
          </h2>
          <p className="text-sm text-muted-foreground">
            JST 基準で日付が今日より前なのに is_available = true のままになっている枠。
            通常は時間経過で満枠扱いに切り替わるはずなので、ここに多く出てくるサロンは
            管理がずさんか、別サイトに最新情報がある可能性が高い。
          </p>
        </header>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="放置されている枠の総数"
            value={formatNumber(staleOverview.total_count)}
            hint="JST 基準で過去日付 × is_available = true"
            tone={staleOverview.total_count > 0 ? "warning" : "success"}
          />
          <KpiCard
            label="影響サロン数"
            value={formatNumber(staleOverview.affected_salon_count)}
            hint="同一枠が複数あっても 1 件として集計"
          />
          <KpiCard
            label="影響セラピスト数"
            value={formatNumber(staleOverview.affected_therapist_count)}
          />
          <KpiCard
            label="最古の放置日付"
            value={
              staleOverview.oldest_date
                ? formatDateJst(staleOverview.oldest_date)
                : "-"
            }
            hint={
              staleOverview.oldest_date
                ? `${staleDaysFromToday(staleOverview.oldest_date)} 日経過`
                : "該当なし"
            }
            tone={
              staleOverview.oldest_date &&
              staleDaysFromToday(staleOverview.oldest_date) >= 7
                ? "destructive"
                : "default"
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              サロン別ワースト（上位 {BY_SALON_LIMIT}）
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">サイト</TableHead>
                  <TableHead>サロン</TableHead>
                  <TableHead className="text-right w-20">枠</TableHead>
                  <TableHead className="text-right w-20">セラピスト</TableHead>
                  <TableHead className="w-32">最古日付</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleBySalon.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      放置されている枠はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  staleBySalon.map((row) => (
                    <TableRow key={row.salon_id}>
                      <TableCell className="text-xs font-mono">
                        {row.site_name}
                      </TableCell>
                      <TableCell className="text-sm">{row.salon_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.stale_count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.affected_therapist_count)}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs whitespace-nowrap">
                        {formatDateJst(row.oldest_date)}
                        <span className="ml-1 text-muted-foreground">
                          ({staleDaysFromToday(row.oldest_date)}d)
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              個別枠リスト（古い順・上位 {STALE_LIST_LIMIT}）
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">スロット</TableHead>
                  <TableHead>サロン / セラピスト</TableHead>
                  <TableHead className="text-right w-20">経過</TableHead>
                  <TableHead className="w-40">最終変化</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleList.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      放置されている枠はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  staleList.map((row) => (
                    <TableRow
                      key={`${row.therapist_id}-${row.slot_date}-${row.start_time}`}
                    >
                      <TableCell className="tabular-nums text-xs whitespace-nowrap">
                        {formatDateJst(row.slot_date)}{" "}
                        {formatStartTime(row.start_time)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {row.site_name} / {row.salon_name}
                          </span>
                          <span>{row.therapist_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {staleDaysFromToday(row.slot_date)}d
                      </TableCell>
                      <TableCell className="tabular-nums text-xs whitespace-nowrap">
                        {formatDateTimeJst(row.last_state_change_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}
