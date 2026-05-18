"use client";

import { useMemo, useId, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, MapPinIcon, SearchIcon, UserRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSalon } from "@/lib/salons";
import { cn } from "@/lib/utils";

const UNCATEGORIZED = "__uncategorized__" as const;

type PrefectureFilter = "all" | typeof UNCATEGORIZED | string;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchesQuery(salon: PublicSalon, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  if (normalize(salon.name).includes(q)) return true;
  if (salon.prefecture && normalize(salon.prefecture).includes(q)) return true;
  for (const a of salon.areas) {
    if (normalize(a).includes(q)) return true;
  }
  return false;
}

function matchesPrefecture(salon: PublicSalon, filter: PrefectureFilter): boolean {
  if (filter === "all") return true;
  if (filter === UNCATEGORIZED) return !salon.prefecture;
  return salon.prefecture === filter;
}

interface PrefectureChip {
  value: PrefectureFilter;
  label: string;
  count: number;
}

function buildPrefectureChips(salons: PublicSalon[]): PrefectureChip[] {
  const counts = new Map<string, number>();
  let uncategorized = 0;
  for (const s of salons) {
    if (s.prefecture) {
      counts.set(s.prefecture, (counts.get(s.prefecture) ?? 0) + 1);
    } else {
      uncategorized += 1;
    }
  }
  // 件数の多い順に並べる。最後に "未分類" を付ける (存在する場合のみ)。
  const ordered: PrefectureChip[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([label, count]) => ({ value: label, label, count }));
  if (uncategorized > 0) {
    ordered.push({ value: UNCATEGORIZED, label: "未分類", count: uncategorized });
  }
  return ordered;
}

export function SupportedSalonsList({
  salons,
  className,
}: {
  salons: PublicSalon[];
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [prefecture, setPrefecture] = useState<PrefectureFilter>("all");
  const inputId = useId();

  const prefectureChips = useMemo(() => buildPrefectureChips(salons), [salons]);

  const filtered = useMemo(
    () =>
      salons.filter((s) => matchesPrefecture(s, prefecture) && matchesQuery(s, query)),
    [salons, query, prefecture],
  );

  if (salons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        対応サロン情報を準備中です。しばらくしてから再度ご確認ください。
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="max-w-md space-y-2">
        <Label htmlFor={inputId} className="text-sm font-medium">
          サロン名・地域で検索
        </Label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="サロン名 / 都道府県 / エリア名"
            className="pl-9"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
          />
        </div>
      </div>

      {prefectureChips.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">都道府県で絞り込み</span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={prefecture === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setPrefecture("all")}
              aria-pressed={prefecture === "all"}
            >
              すべて
              <span className="ml-1 tabular-nums text-xs opacity-70">
                {salons.length}
              </span>
            </Button>
            {prefectureChips.map((chip) => (
              <Button
                key={chip.value}
                type="button"
                variant={prefecture === chip.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPrefecture(chip.value)}
                aria-pressed={prefecture === chip.value}
              >
                {chip.label}
                <span className="ml-1 tabular-nums text-xs opacity-70">
                  {chip.count}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length === salons.length
          ? `全 ${salons.length} 件を表示しています`
          : `${filtered.length} 件が該当しました（全 ${salons.length} 件）`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          該当するサロンがありません。条件を変えてお試しください。
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((salon) => (
            <li key={salon.id}>
              <Link
                href={`/salons/${salon.id}`}
                className="group flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm text-card-foreground shadow-sm outline-none transition-colors hover:border-foreground/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1 leading-snug">
                    <span className="truncate group-hover:underline">
                      {salon.name}
                    </span>
                    <ChevronRightIcon
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                  {(salon.prefecture || salon.areas.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3 shrink-0" aria-hidden />
                      {salon.prefecture && (
                        <Badge variant="secondary" className="font-normal">
                          {salon.prefecture}
                        </Badge>
                      )}
                      {salon.areas.slice(0, 3).map((area) => (
                        <span key={area} className="truncate">
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
      )}
    </div>
  );
}
