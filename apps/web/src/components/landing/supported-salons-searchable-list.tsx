"use client";

import { useMemo, useId, useState } from "react";
import { SearchIcon, UserRoundIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSalon } from "@/lib/salons";
import { cn } from "@/lib/utils";

function matchesQuery(salonName: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return salonName.toLowerCase().includes(q.toLowerCase());
}

export function SupportedSalonsList({
  salons,
  className,
}: {
  salons: PublicSalon[];
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();

  const filtered = useMemo(
    () => salons.filter((s) => matchesQuery(s.name, query)),
    [salons, query],
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
          サロン名で検索
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
            placeholder="キーワードを入力"
            className="pl-9"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {query.trim()
            ? `${filtered.length} 件が該当しました（全 ${salons.length} 件）`
            : `全 ${salons.length} 件を表示しています`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          該当するサロンがありません。別のキーワードをお試しください。
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((salon) => (
            <li
              key={salon.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm text-card-foreground shadow-sm"
            >
              <span className="min-w-0 leading-snug">{salon.name}</span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
