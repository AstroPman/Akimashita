import { Users2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSeatsSnapshot } from "@/lib/seats";

interface Props {
  className?: string;
  variant?: "inline" | "card";
}

/**
 * 限定席の現状を表示するサーバコンポーネント。
 * - inline: バッジ風の小さな表示（ヒーロー直下用）
 * - card  : 進捗バー付きの大きめ表示（料金ページ等）
 */
export async function SeatsIndicator({ className, variant = "inline" }: Props) {
  const seats = await getSeatsSnapshot();
  const filledRatio = seats.max > 0 ? Math.min(1, seats.occupied / seats.max) : 1;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "rounded-xl border bg-card p-5 text-card-foreground",
          className,
        )}
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users2Icon className="size-4 text-muted-foreground" />
            <span>限定 {seats.max} 名のサービス</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {seats.occupied} / {seats.max} 名
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              seats.isFull ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.round(filledRatio * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {seats.isFull
            ? "現在は満員です。空きが出次第ご案内するウェイトリストにご登録ください。"
            : `通知の価値を保つため登録は限定です。残り ${seats.remaining} 席。`}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
      <Users2Icon className="size-3.5" />
      <span>
        限定 {seats.max} 名 ／ 現在 {seats.occupied} 名
        {seats.isFull ? "（満員）" : `（残り ${seats.remaining} 席）`}
      </span>
    </div>
  );
}
