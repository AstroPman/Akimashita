import Link from "next/link";
import { cn } from "@/lib/utils";

const RANGES = [30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeDays = 30;

export function parseRange(value: string | string[] | undefined): RangeDays {
  if (typeof value !== "string") return DEFAULT_RANGE;
  const parsed = Number.parseInt(value, 10);
  return (RANGES as readonly number[]).includes(parsed)
    ? (parsed as RangeDays)
    : DEFAULT_RANGE;
}

export function PeriodSelector({
  basePath,
  current,
}: {
  basePath: string;
  current: RangeDays;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5 text-xs"
      role="group"
      aria-label="期間選択"
    >
      {RANGES.map((days) => {
        const active = days === current;
        return (
          <Link
            key={days}
            href={`${basePath}?range=${days}`}
            className={cn(
              "rounded px-3 py-1 transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {days}日
          </Link>
        );
      })}
    </div>
  );
}
