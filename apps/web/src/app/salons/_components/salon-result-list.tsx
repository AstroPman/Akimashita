import Link from "next/link";
import { ChevronRightIcon, MapPinIcon, UserRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicSalon } from "@/lib/salons";

/**
 * /salons の検索結果（サロン軸）。
 * 既存 `[SupportedSalonsList](apps/web/src/components/landing/supported-salons-searchable-list.tsx)`
 * のカードと見た目を揃え、リンク先は新しい canonical な詳細パス。
 */
export function SalonResultList({ salons }: { salons: PublicSalon[] }) {
  if (salons.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        該当するサロンがありません。条件を変えてお試しください。
      </p>
    );
  }

  return (
    // モバイルでは親 section の px-4 を打ち消して画面端まで広げ、divide-y のリスト風に。
    // sm 以上では従来通り 2 カラムのカードグリッドに戻す。
    <ul className="-mx-4 divide-y bg-card sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-2 sm:divide-y-0 sm:bg-transparent">
      {salons.map((salon) => (
        <li key={salon.id}>
          <Link
            href={`/salons/${salon.id}`}
            className="group flex w-full items-start justify-between gap-3 px-4 py-3 text-sm text-card-foreground outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:rounded-lg sm:border sm:bg-card sm:px-3 sm:shadow-sm sm:hover:border-foreground/30 sm:focus-visible:ring-offset-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1 leading-snug">
                <span className="truncate font-medium group-hover:underline">
                  {salon.name}
                </span>
                <ChevronRightIcon
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              {(salon.prefecture || salon.areas.length > 0) && (
                <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <MapPinIcon className="size-3 shrink-0" aria-hidden />
                  {salon.prefecture && (
                    <Badge variant="secondary" className="font-normal">
                      {salon.prefecture}
                    </Badge>
                  )}
                  {salon.areas.slice(0, 3).map((area) => (
                    <span key={area} className="min-w-0 truncate">
                      {area}
                    </span>
                  ))}
                  {salon.areas.length > 3 && (
                    <span aria-label={`他 ${salon.areas.length - 3} エリア`}>
                      +{salon.areas.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground"
              aria-label={`在籍 ${salon.therapistCount} 名`}
              title={`在籍 ${salon.therapistCount} 名`}
            >
              <UserRoundIcon className="size-4 shrink-0" aria-hidden />
              <span className="text-sm font-medium text-foreground" aria-hidden>
                {salon.therapistCount}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
