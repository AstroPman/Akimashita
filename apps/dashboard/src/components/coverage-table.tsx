import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";

export interface CoverageItem {
  label: string;
  filled: number;
  total: number;
  hint?: string;
}

interface CoverageTableProps {
  items: CoverageItem[];
  className?: string;
}

// 「項目別カバレッジ」を表示する軽量コンポーネント。
// 1 行 = 項目名 / 充足数(母数) / 横棒 / 割合 の固定レイアウト。
export function CoverageTable({ items, className }: CoverageTableProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {items.map((item) => {
        const pct =
          item.total > 0 ? Math.min(100, (item.filled / item.total) * 100) : 0;
        const tone =
          item.total === 0
            ? "bg-muted"
            : pct >= 80
              ? "bg-emerald-500/70"
              : pct >= 50
                ? "bg-amber-500/70"
                : "bg-destructive/70";
        return (
          <div
            key={item.label}
            className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,auto)_minmax(8rem,1fr)_minmax(3rem,auto)] items-center gap-3 text-sm"
          >
            <div className="truncate">
              <span className="font-medium">{item.label}</span>
              {item.hint ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  {item.hint}
                </span>
              ) : null}
            </div>
            <div className="text-right tabular-nums text-xs text-muted-foreground">
              {formatNumber(item.filled)} / {formatNumber(item.total)}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full", tone)}
                style={{ width: `${pct.toFixed(1)}%` }}
              />
            </div>
            <div className="text-right tabular-nums text-xs font-medium">
              {formatPercent(item.filled, item.total)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
