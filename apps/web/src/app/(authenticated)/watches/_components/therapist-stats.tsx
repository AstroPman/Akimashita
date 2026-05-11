import { Fragment } from "react";
import { CalendarDaysIcon, FlameIcon, TimerIcon, UsersIcon } from "lucide-react";
import { dayjs, JST, formatJstDate } from "@/lib/date";
import { formatKillSeconds } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TherapistStats = {
  next_shift_date: string | null;
  recent_shift_days: number;
  recent_opening_count: number;
  median_kill_seconds: number | null;
  dow_hour_heatmap: { dow: number; hour: number; count: number }[];
  watcher_count: number;
  window_days: number;
};

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function formatNextShift(date: string | null): {
  primary: string;
  secondary: string;
} {
  if (!date) return { primary: "未定", secondary: "公開待ち" };
  const target = dayjs.tz(date, JST).startOf("day");
  const today = dayjs().tz(JST).startOf("day");
  const diff = target.diff(today, "day");
  const secondary =
    diff === 0 ? "今日" : diff === 1 ? "明日" : diff > 0 ? `${diff}日後` : "予定済";
  return { primary: formatJstDate(date), secondary };
}

function colorForCount(count: number, max: number): string {
  if (max === 0 || count === 0) return "bg-muted";
  const ratio = count / max;
  if (ratio >= 0.8) return "bg-primary";
  if (ratio >= 0.6) return "bg-primary/75";
  if (ratio >= 0.4) return "bg-primary/55";
  if (ratio >= 0.2) return "bg-primary/35";
  return "bg-primary/20";
}

function SummaryStat({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span aria-hidden className="text-muted-foreground/80">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">
        {value}
      </p>
      {helper ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function DowHourHeatmap({
  data,
}: {
  data: { dow: number; hour: number; count: number }[];
}) {
  const counts = new Map<string, number>();
  let max = 0;
  for (const d of data) {
    counts.set(`${d.dow}:${d.hour}`, d.count);
    if (d.count > max) max = d.count;
  }

  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const DOWS = Array.from({ length: 7 }, (_, d) => d);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">曜日 × 時間帯の空き出現</h3>
        <span className="text-xs text-muted-foreground">日〜土 / 0〜23時</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-max gap-1"
          style={{
            gridTemplateColumns: "auto repeat(24, minmax(0.875rem, 1fr))",
          }}
        >
          <div aria-hidden />
          {HOURS.map((hour) => (
            <div
              key={`h-${hour}`}
              className="text-center text-[10px] tabular-nums leading-none text-muted-foreground"
            >
              {hour % 3 === 0 ? hour : ""}
            </div>
          ))}

          {DOWS.map((dow) => (
            <Fragment key={`row-${dow}`}>
              <div
                className={cn(
                  "flex items-center justify-end pr-1 text-xs font-medium leading-none",
                  dow === 0 && "text-rose-500",
                  dow === 6 && "text-sky-500",
                )}
              >
                {DOW_LABELS[dow]}
              </div>
              {HOURS.map((hour) => {
                const count = counts.get(`${dow}:${hour}`) ?? 0;
                return (
                  <div
                    key={`c-${dow}-${hour}`}
                    className={cn(
                      "aspect-square rounded-sm",
                      colorForCount(count, max),
                    )}
                    title={`${DOW_LABELS[dow]}曜 ${hour}時台 ${count}回`}
                    aria-label={`${DOW_LABELS[dow]}曜 ${hour}時台 ${count}回`}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TherapistStatsBlock({ stats }: { stats: TherapistStats }) {
  const next = formatNextShift(stats.next_shift_date);
  const windowLabel = `直近${stats.window_days}日`;
  const hasAnyEvent =
    stats.recent_opening_count > 0 || stats.dow_hour_heatmap.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          icon={<CalendarDaysIcon className="size-4" />}
          label="次の出勤"
          value={next.secondary}
          helper={next.primary || "—"}
        />
        <SummaryStat
          icon={<CalendarDaysIcon className="size-4" />}
          label={`${windowLabel}のシフト日数`}
          value={`${stats.recent_shift_days}日`}
          helper="記録された出勤日数"
        />
        <SummaryStat
          icon={<FlameIcon className="size-4" />}
          label={`${windowLabel}の空き出現`}
          value={`${stats.recent_opening_count}回`}
          helper="キャンセル + 新着の合計"
        />
        <SummaryStat
          icon={<TimerIcon className="size-4" />}
          label="平均瞬殺時間"
          value={formatKillSeconds(stats.median_kill_seconds)}
          helper="出現から再満枠までの中央値"
        />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
          競争率
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">
          {stats.watcher_count.toLocaleString("ja-JP")}人
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          このセラピストを監視中のユーザ数（自分を含む）
        </p>
      </div>

      {hasAnyEvent ? (
        <div className="rounded-xl border bg-card p-4">
          <DowHourHeatmap data={stats.dow_hour_heatmap} />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          まだ集計に十分なデータがありません。状態変化の蓄積をお待ちください。
        </div>
      )}
    </div>
  );
}
