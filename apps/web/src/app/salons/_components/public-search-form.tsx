"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  MapPinIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  UserIcon,
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

  // URL に反映済みの条件 (initial) を「アクティブな絞り込み」として表示する。
  // ユーザが入力欄を編集した未送信の値は対象外。
  const activeFilters = useMemo(() => {
    const items: {
      key: "area" | "salon" | "therapist";
      label: string;
      value: string;
    }[] = [];
    if (initial.area) {
      items.push({ key: "area", label: "エリア", value: initial.area });
    }
    if (initial.salon) {
      items.push({ key: "salon", label: "サロン", value: initial.salon });
    }
    if (initial.therapist) {
      items.push({
        key: "therapist",
        label: "セラピスト",
        value: initial.therapist,
      });
    }
    return items;
  }, [initial.area, initial.salon, initial.therapist]);

  const hasAnyInput =
    salon.trim().length > 0 ||
    therapist.trim().length > 0 ||
    area.trim().length > 0;

  // 入力欄の値と initial が完全に一致するかで「未送信の編集中」を判定。
  // (検索ボタンの強調表示に使う)
  const isDirty =
    salon.trim() !== initial.salon ||
    therapist.trim() !== initial.therapist ||
    area.trim() !== initial.area;

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

  const removeFilter = (key: "area" | "salon" | "therapist") => {
    const nextSalon = key === "salon" ? "" : salon.trim();
    const nextTherapist = key === "therapist" ? "" : therapist.trim();
    const nextArea = key === "area" ? "" : area.trim();
    if (key === "salon") setSalon("");
    if (key === "therapist") setTherapist("");
    if (key === "area") setArea("");
    const next = new URLSearchParams();
    if (nextSalon) next.set("salon", nextSalon);
    if (nextTherapist) next.set("therapist", nextTherapist);
    if (nextArea) next.set("area", nextArea);
    navigate(next);
  };

  return (
    <form
      onSubmit={submit}
      // モバイルでは親 section の px-4 を打ち消して画面端まで広げる。
      // sm 以上は浮き上がるパネル風カードに。
      // 微弱なグラデと多層シャドウで、平坦な「枠」感を脱却する。
      className={cn(
        "-mx-4 border-y bg-card sm:mx-0 sm:rounded-2xl sm:border",
        "bg-gradient-to-br from-card via-card to-muted/40",
        "sm:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.12)]",
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SlidersHorizontalIcon className="size-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-tight">条件で絞り込む</p>
          <p className="text-[11px] text-muted-foreground">
            エリア・サロン名・セラピスト名で横断検索できます
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="area-trigger"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <MapPinIcon className="size-3.5" />
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
                    "h-12 w-full justify-between rounded-xl border-input bg-background px-3.5 font-normal transition-all",
                    "hover:border-ring/40 hover:bg-background",
                    "aria-expanded:border-ring aria-expanded:ring-3 aria-expanded:ring-ring/20",
                    !area && "text-muted-foreground",
                    area && "border-foreground/20 bg-muted/40 font-medium text-foreground",
                  )}
                >
                  <span className="truncate text-left">
                    {area
                      ? selectedAreaPrefecture
                        ? `${selectedAreaPrefecture} / ${area}`
                        : area
                      : "すべてのエリア"}
                  </span>
                  <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
              >
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

          <IconInputField
            id="salon-input"
            label="サロン名"
            icon={<Building2Icon className="size-3.5" />}
            placeholder="例: ジュエリースパ"
            value={salon}
            onChange={setSalon}
          />

          <IconInputField
            id="therapist-input"
            label="セラピスト名"
            icon={<UserIcon className="size-3.5" />}
            placeholder="例: まり"
            value={therapist}
            onChange={setTherapist}
          />
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          セラピスト名を入れるとサロンを跨いで検索します。サロン名のみのときは対応サロン一覧を表示します。
        </p>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              絞り込み中:
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => removeFilter(f.key)}
                disabled={isPending}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-2.5 pr-1.5 text-xs font-medium shadow-sm transition-colors",
                  "hover:border-foreground/30 hover:bg-muted",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                aria-label={`${f.label}「${f.value}」の絞り込みを解除`}
              >
                <span className="text-muted-foreground">{f.label}:</span>
                <span className="text-foreground">{f.value}</span>
                <span className="ml-0.5 flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground/10 group-hover:text-foreground">
                  <XIcon className="size-3" />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {hasAnyInput || activeFilters.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={isPending}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
              条件をリセット
            </Button>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className={cn(
              "h-11 gap-2 px-5 text-sm font-semibold tracking-tight",
              "shadow-sm transition-all",
              "hover:shadow-md",
              isDirty && "ring-2 ring-primary/20 ring-offset-2 ring-offset-card",
            )}
          >
            <SearchIcon className="size-4" />
            {isPending ? "検索中..." : "この条件で検索"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * 左にアイコンを内包したテキスト入力。
 * focus-within でカード全体にリングを出すことで、操作中のフィールドを強調する。
 */
function IconInputField({
  id,
  label,
  icon,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </Label>
      <div
        className={cn(
          "group relative flex h-12 w-full items-center rounded-xl border border-input bg-background transition-all",
          "hover:border-ring/40",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
          hasValue && "border-foreground/20 bg-muted/40",
        )}
      >
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          className={cn(
            "h-full flex-1 rounded-xl border-0 bg-transparent px-3.5 text-sm shadow-none",
            "focus-visible:border-0 focus-visible:ring-0",
            "dark:bg-transparent",
          )}
        />
        {hasValue ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mr-2 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`${label}をクリア`}
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
