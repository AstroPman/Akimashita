import Link from "next/link";
import { MapPinIcon, UserRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicTherapistSearchHit } from "@/lib/salons";

/**
 * /salons の検索結果（セラピスト軸）。
 * `[get_public_therapists](supabase/migrations/20260516000003_get_public_therapists.sql)`
 * の結果を carousel ではなくグリッド表示する。サロン名と所在エリアを
 * 必ず併記し、リンク先はカノニカルな `/salons/[id]/therapists/[id]`。
 */
export function TherapistResultList({
  therapists,
}: {
  therapists: PublicTherapistSearchHit[];
}) {
  if (therapists.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        該当するセラピストがいません。条件を変えてお試しください。
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {therapists.map((t) => {
        const sub: string[] = [];
        if (t.height) sub.push(`T${t.height}`);
        if (t.cup) sub.push(`${t.cup}カップ`);
        if (t.age) sub.push(`${t.age}歳`);
        const subText =
          sub.length > 0 ? sub.join(" / ") : (t.styleRaw ?? null);

        return (
          <li key={`${t.salonId}:${t.id}`}>
            <Link
              href={`/salons/${t.salonId}/therapists/${t.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm outline-none transition-colors hover:border-foreground/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
                {t.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 外部ホスト由来で next/image の許可リストに載せない
                  <img
                    src={t.primaryImageUrl}
                    alt=""
                    className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex size-full items-center justify-center text-muted-foreground"
                    aria-hidden
                  >
                    <UserRoundIcon
                      className="size-16"
                      strokeWidth={1.25}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <h3 className="text-sm font-semibold leading-tight">
                  {t.displayName}
                </h3>
                {subText ? (
                  <p className="text-xs text-muted-foreground">{subText}</p>
                ) : null}
                <p className="mt-auto truncate text-xs text-muted-foreground">
                  {t.salonName}
                </p>
                {(t.prefecture || t.areas.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPinIcon className="size-3 shrink-0" aria-hidden />
                    {t.prefecture && (
                      <Badge variant="secondary" className="font-normal">
                        {t.prefecture}
                      </Badge>
                    )}
                    {t.areas.slice(0, 2).map((a) => (
                      <span key={a} className="truncate">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
