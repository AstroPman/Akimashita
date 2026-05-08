import { CalendarDaysIcon, FlameIcon, TimerIcon, UsersIcon } from "lucide-react";
import { dayjs, JST, formatJstDate } from "@/lib/date";
import { cn } from "@/lib/utils";

export type TherapistStats = {
  next_shift_date: string | null;
  recent_shift_days: number;
  recent_opening_count: number;
  median_kill_seconds: number | null;
  hourly_heatmap: { hour: number; count: number }[];
  dow_heatmap: { dow: number; count: number }[];
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

function formatKillSeconds(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m}分` : `${m}分${s}秒`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
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

function textOnFill(count: number, max: number): string {
  if (max === 0 || count === 0) return "text-muted-foreground";
  const ratio = count / max;
  return ratio >= 0.6 ? "text-primary-foreground" : "text-foreground";
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

function HourlyHeatmap({ data }: { data: { hour: number; count: number }[] }) {
  const counts = new Map(data.map((d) => [d.hour, d.count]));
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);
  const cells = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: counts.get(hour) ?? 0,
  }));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">時間帯別の空き出現</h3>
        <span className="text-xs text-muted-foreground">
          0〜23時 / 直近の総出現数
        </span>
      </div>
      <div className="mt-3 grid grid-cols-12 gap-1">
        {cells.map(({ hour, count }) => (
          <div
            key={hour}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-md text-[10px] font-medium tabular-nums",
              colorForCount(count, max),
              textOnFill(count, max),
            )}
            title={`${hour}時台 ${count}回`}
            aria-label={`${hour}時台 ${count}回`}
          >
            <span className="leading-none">{hour}</span>
            {count > 0 ? (
              <span className="mt-0.5 leading-none">{count}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function DowHeatmap({ data }: { data: { dow: number; count: number }[] }) {
  const counts = new Map(data.map((d) => [d.dow, d.count]));
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);
  const cells = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    count: counts.get(dow) ?? 0,
  }));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">曜日別の空き出現</h3>
        <span className="text-xs text-muted-foreground">日〜土</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {cells.map(({ dow, count }) => (
          <div
            key={dow}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-md text-xs font-medium tabular-nums",
              colorForCount(count, max),
              textOnFill(count, max),
              dow === 0 && "ring-1 ring-rose-300/40",
              dow === 6 && "ring-1 ring-sky-300/40",
            )}
            title={`${DOW_LABELS[dow]}曜 ${count}回`}
          >
            <span className="leading-none">{DOW_LABELS[dow]}</span>
            <span className="mt-0.5 text-[10px] leading-none">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TherapistStatsBlock({ stats }: { stats: TherapistStats }) {
  const next = formatNextShift(stats.next_shift_date);
  const windowLabel = `直近${stats.window_days}日`;
  const hasAnyEvent =
    stats.recent_opening_count > 0 ||
    stats.hourly_heatmap.length > 0 ||
    stats.dow_heatmap.length > 0;

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
          helper="DBに記録された出勤日数"
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
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <HourlyHeatmap data={stats.hourly_heatmap} />
          <DowHeatmap data={stats.dow_heatmap} />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          まだ集計に十分なデータがありません。状態変化の蓄積をお待ちください。
        </div>
      )}
    </div>
  );
}
