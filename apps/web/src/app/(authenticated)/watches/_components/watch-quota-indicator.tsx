import { cn } from "@/lib/utils";
import type { WatchQuota } from "@/lib/watches/quota";

type Tone = "default" | "warning" | "destructive";

function pickTone(quota: WatchQuota): Tone {
  if (quota.isFull) return "destructive";
  if (quota.remaining <= 3) return "warning";
  return "default";
}

export function WatchQuotaIndicator({
  quota,
  className,
}: {
  quota: WatchQuota;
  className?: string;
}) {
  const percent =
    quota.max > 0 ? Math.min(100, (quota.used / quota.max) * 100) : 0;
  const tone = pickTone(quota);

  return (
    <div
      className={cn("rounded-lg border bg-card p-3 sm:p-4", className)}
      data-testid="watch-quota-indicator"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <p className="text-xs font-medium text-muted-foreground">登録数</p>
          <p className="text-sm font-semibold tabular-nums">
            <span
              className={cn(
                tone === "destructive" && "text-destructive",
                tone === "warning" && "text-amber-600 dark:text-amber-400",
              )}
            >
              {quota.used}
            </span>
            <span className="mx-0.5 text-muted-foreground">/</span>
            <span>{quota.max}</span>
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              件
            </span>
          </p>
        </div>
        <p
          className={cn(
            "text-xs tabular-nums",
            tone === "destructive" && "font-medium text-destructive",
            tone === "warning" &&
              "font-medium text-amber-600 dark:text-amber-400",
            tone === "default" && "text-muted-foreground",
          )}
        >
          {quota.isFull ? "上限に達しています" : `残り ${quota.remaining} 件`}
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={quota.used}
        aria-valuemin={0}
        aria-valuemax={quota.max}
        aria-label="監視設定の登録数"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "destructive" && "bg-destructive",
            tone === "warning" && "bg-amber-500",
            tone === "default" && "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        1 アカウントあたり最大 {quota.max} 件まで登録できます。
      </p>
    </div>
  );
}
