"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type AreaGroup = {
  prefecture: string;
  areas: string[];
};

type Props = {
  /** URL から復元する初期値 (Server から渡す)。 */
  initial: {
    salon: string;
    therapist: string;
    area: string;
  };
  /** エリア選択用のチョイス。Server で `getPublicSalons` から組み立てる。 */
  areaGroups: AreaGroup[];
};

/**
 * /salons の検索フォーム (クライアント側)。
 *
 * - URL の searchParams を唯一の真実とする。submit すると `router.push` で
 *   ?salon=...&therapist=...&area=... を更新し、Server Component が結果を
 *   再描画する。
 * - 検索ボタンを押さず単に入力欄を編集するだけでは結果は変わらない。
 *   モバイル等のキー入力コストを考慮した上での「明示的な検索」モデル。
 * - 「戻る / 進む」や URL 直書きで params が変わった際は、親側で
 *   `key={JSON.stringify(initial)}` を渡してコンポーネントを remount する
 *   ことで入力値を同期する (React 19 の `react-hooks/set-state-in-effect`
 *   ルールに抵触する setEffect-driven sync を避けるため)。
 */
export function PublicSearchForm({ initial, areaGroups }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [salon, setSalon] = useState(initial.salon);
  const [therapist, setTherapist] = useState(initial.therapist);
  const [area, setArea] = useState<string>(initial.area);
  const [areaOpen, setAreaOpen] = useState(false);

  const selectedAreaPrefecture = useMemo(() => {
    if (!area) return null;
    return (
      areaGroups.find((g) => g.areas.includes(area))?.prefecture ?? null
    );
  }, [areaGroups, area]);

  const hasAnyFilter =
    salon.trim().length > 0 ||
    therapist.trim().length > 0 ||
    area.trim().length > 0;

  const navigate = (next: URLSearchParams) => {
    const qs = next.toString();
    const url = qs ? `/salons?${qs}` : "/salons";
    startTransition(() => {
      router.push(url, { scroll: false });
    });
  };

  const submit = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (salon.trim()) next.set("salon", salon.trim());
    if (therapist.trim()) next.set("therapist", therapist.trim());
    if (area.trim()) next.set("area", area.trim());
    navigate(next);
  };

  const clearAll = () => {
    setSalon("");
    setTherapist("");
    setArea("");
    navigate(new URLSearchParams());
  };

  return (
    <form
      onSubmit={submit}
      // モバイルでは親 section の px-4 を打ち消して画面端まで広げ、上下ボーダーのみのバナー風に。
      // sm 以上では中に浮く角丸カードに戻す。
      className="-mx-4 space-y-4 border-y bg-card p-4 sm:mx-0 sm:rounded-xl sm:border sm:p-5 sm:shadow-sm"
    >
      <div className="space-y-2">
        <Label htmlFor="area-trigger" className="text-sm font-medium">
          エリア
        </Label>
        <Popover open={areaOpen} onOpenChange={setAreaOpen}>
          <PopoverTrigger asChild>
            <Button
              id="area-trigger"
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={areaOpen}
              disabled={areaGroups.length === 0}
              className={cn(
                "h-11 w-full justify-between font-normal",
                !area && "text-muted-foreground",
              )}
            >
              <span className="truncate">
                {area
                  ? selectedAreaPrefecture
                    ? `${selectedAreaPrefecture} / ${area}`
                    : area
                  : "すべてのエリア"}
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
            <Command>
              <CommandInput placeholder="エリア名で検索..." />
              <CommandList>
                <CommandEmpty>該当するエリアがありません</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      setArea("");
                      setAreaOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 size-4",
                        area === "" ? "opacity-100" : "opacity-0",
                      )}
                    />
                    すべてのエリア
                  </CommandItem>
                </CommandGroup>
                {areaGroups.map((group) => (
                  <CommandGroup
                    key={group.prefecture}
                    heading={group.prefecture}
                  >
                    {group.areas.map((a) => (
                      <CommandItem
                        key={`${group.prefecture}|${a}`}
                        value={`${group.prefecture} ${a}`}
                        onSelect={() => {
                          setArea(a);
                          setAreaOpen(false);
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            area === a ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {a}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="salon-input" className="text-sm font-medium">
            サロン名
          </Label>
          <Input
            id="salon-input"
            type="search"
            value={salon}
            onChange={(e) => setSalon(e.target.value)}
            placeholder="例: ジュエリースパ"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="therapist-input" className="text-sm font-medium">
            セラピスト名
          </Label>
          <Input
            id="therapist-input"
            type="search"
            value={therapist}
            onChange={(e) => setTherapist(e.target.value)}
            placeholder="例: まり"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            className="h-11"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        セラピスト名を入れるとサロンを跨いで検索します。サロン名のみのときは対応サロン一覧を表示します。
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {hasAnyFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={isPending}
            className="gap-1.5"
          >
            <XIcon className="size-4" />
            条件をリセット
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending} className="gap-1.5">
          <SearchIcon className="size-4" />
          {isPending ? "検索中..." : "検索する"}
        </Button>
      </div>
    </form>
  );
}
