import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_VALUES,
  type AvailabilityEventType,
} from "@/lib/queries/availability";

const HOURS_OPTIONS = [
  { value: 24, label: "24h" },
  { value: 72, label: "3日" },
  { value: 168, label: "7日" },
] as const;

export type HoursWindow = (typeof HOURS_OPTIONS)[number]["value"];

export const HOURS_VALUES = HOURS_OPTIONS.map((o) => o.value) as readonly number[];
export const DEFAULT_HOURS: HoursWindow = 24;

export function parseHours(value: string | string[] | undefined): HoursWindow {
  if (typeof value !== "string") return DEFAULT_HOURS;
  const parsed = Number.parseInt(value, 10);
  return HOURS_VALUES.includes(parsed) ? (parsed as HoursWindow) : DEFAULT_HOURS;
}

function buildHref(
  basePath: string,
  current: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const next: Record<string, string | undefined> = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function HoursSelector({
  basePath,
  current,
  searchParams,
}: {
  basePath: string;
  current: HoursWindow;
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 text-xs"
      role="group"
      aria-label="時間窓選択"
    >
      {HOURS_OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <Link
            key={opt.value}
            href={buildHref(basePath, searchParams, {
              hours: String(opt.value),
            })}
            className={cn(
              "rounded px-3 py-1 transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

export function EventTypeSelector({
  basePath,
  current,
  searchParams,
}: {
  basePath: string;
  current: AvailabilityEventType | undefined;
  searchParams: Record<string, string | undefined>;
}) {
  const items: Array<{ value: AvailabilityEventType | "all"; label: string }> = [
    { value: "all", label: "全種別" },
    ...EVENT_TYPE_VALUES.map((v) => ({ value: v, label: EVENT_TYPE_LABEL[v] })),
  ];

  return (
    <div
      className="inline-flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 text-xs"
      role="group"
      aria-label="イベント種別選択"
    >
      {items.map((opt) => {
        const active =
          opt.value === "all" ? current === undefined : opt.value === current;
        return (
          <Link
            key={opt.value}
            href={buildHref(basePath, searchParams, {
              event_type: opt.value === "all" ? undefined : opt.value,
            })}
            className={cn(
              "rounded px-3 py-1 transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
