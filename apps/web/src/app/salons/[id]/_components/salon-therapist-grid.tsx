"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellPlusIcon,
  ExternalLinkIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicSalonTherapist } from "@/lib/salons";

type Props = {
  salonId: string;
  therapists: PublicSalonTherapist[];
};

/** 検索欄を出すかどうかの閾値。これ未満ならスクロールでも十分探せる想定。 */
const SEARCH_THRESHOLD = 6;

/**
 * NFKC で全角/半角を畳んだ上で、ひらがなをカタカナに揃えて lower-case 化する。
 * 「まり」「マリ」「ﾏﾘ」「Mari」が同じキーになる程度のゆるい正規化。
 * Levenshtein など重い処理はしない。
 */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) + 0x60),
    );
}

export function SalonTherapistGrid({ salonId, therapists }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const normalizedQuery = useMemo(
    () => normalize(deferredQuery.trim()),
    [deferredQuery],
  );

  const filtered = useMemo(() => {
    if (!normalizedQuery) return therapists;
    return therapists.filter((t) => {
      const haystack = `${normalize(t.displayName)} ${normalize(t.name)}`;
      return haystack.includes(normalizedQuery);
    });
  }, [therapists, normalizedQuery]);

  const showSearch = therapists.length >= SEARCH_THRESHOLD;
  const isFiltering = normalizedQuery.length > 0;

  return (
    <div className="mt-6 space-y-4">
      {showSearch ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="セラピスト名で絞り込み"
              aria-label="セラピスト名で絞り込み"
              autoComplete="off"
              enterKeyHint="search"
              spellCheck={false}
              className="h-11 pl-9 pr-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery("")}
                aria-label="入力をクリア"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {isFiltering ? (
              <>
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{" "}
                / {therapists.length} 名
              </>
            ) : (
              <>{therapists.length} 名</>
            )}
          </p>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>「{deferredQuery.trim()}」に一致するセラピストは見つかりませんでした。</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQuery("")}
            className="mt-2 gap-1.5"
          >
            <XIcon className="size-4" />
            条件をクリア
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="group relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted text-white shadow-sm"
            >
              <Link
                href={`/salons/${salonId}/therapists/${t.id}`}
                aria-label={`${t.displayName} の詳細を見る`}
                className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 外部ホスト由来で next/image の許可リストに載せない
                  <img
                    src={t.primaryImageUrl}
                    alt=""
                    className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex size-full items-center justify-center bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    <UserRoundIcon className="size-16" strokeWidth={1.25} />
                  </div>
                )}
              </Link>

              <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
                {t.externalProfileUrl ? (
                  <Button
                    asChild
                    size="icon-sm"
                    variant="secondary"
                    className="rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70 hover:text-white"
                  >
                    <a
                      href={t.externalProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t.displayName} の公式プロフィール`}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button
                  asChild
                  size="icon-sm"
                  className="rounded-full shadow-md sm:hidden"
                >
                  <Link
                    href={`/watches/new?therapist_id=${encodeURIComponent(
                      t.id,
                    )}`}
                    aria-label={`${t.displayName} を空き通知に追加`}
                  >
                    <BellPlusIcon className="size-3.5" />
                  </Link>
                </Button>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-3 pt-10">
                <div className="[text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                  <h3 className="line-clamp-1 text-sm font-semibold leading-tight sm:text-base">
                    {t.displayName}
                  </h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/90 sm:text-xs">
                    {t.height ? <span>T{t.height}</span> : null}
                    {t.cup ? <span>{t.cup}カップ</span> : null}
                    {t.styleRaw && !t.height && !t.cup ? (
                      <span className="line-clamp-1">{t.styleRaw}</span>
                    ) : null}
                  </div>
                </div>

                <Button
                  asChild
                  size="sm"
                  className="pointer-events-auto hidden h-8 w-full gap-1.5 px-2 text-xs sm:inline-flex"
                >
                  <Link
                    href={`/watches/new?therapist_id=${encodeURIComponent(
                      t.id,
                    )}`}
                  >
                    <BellPlusIcon className="size-3.5" />
                    空き通知に追加
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
