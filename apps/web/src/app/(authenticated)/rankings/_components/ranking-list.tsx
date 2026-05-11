import { UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveTherapistImageSrc } from "@/lib/therapist-image";

export interface RankingListItem {
  therapistId: string;
  name: string;
  imageUrl: string | null;
  profileUrl: string | null;
  salonName: string;
  /** メイン指標。例: 「45秒」「12人」 */
  metricLabel: string;
  /** サブテキスト（サンプル数など）。任意 */
  metricSublabel?: string;
}

function rankBadgeClasses(rank: number): string {
  if (rank === 1) return "bg-amber-400/90 text-amber-950";
  if (rank === 2) return "bg-zinc-300 text-zinc-900";
  if (rank === 3) return "bg-orange-400/80 text-orange-950";
  return "bg-muted text-muted-foreground";
}

export function RankingList({
  items,
  emptyText,
}: {
  items: RankingListItem[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <ol className="divide-y rounded-xl border bg-card">
      {items.map((item, index) => {
        const rank = index + 1;
        const imageSrc = resolveTherapistImageSrc(
          item.imageUrl,
          item.profileUrl,
        );

        return (
          <li
            key={item.therapistId}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                rankBadgeClasses(rank),
              )}
              aria-label={`${rank}位`}
            >
              {rank}
            </span>

            <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- 予約サイト由来でホストが不定のため next/image の許可リストに載せない
                <img
                  src={imageSrc}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex size-full items-center justify-center text-muted-foreground"
                  aria-hidden
                >
                  <UserRoundIcon className="size-6" strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.salonName}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-base font-semibold tabular-nums leading-tight">
                {item.metricLabel}
              </p>
              {item.metricSublabel ? (
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {item.metricSublabel}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
