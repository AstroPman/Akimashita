"use client";

import {
  useMemo,
  useOptimistic,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpDownIcon,
  ChevronRightIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { dayjs, formatJstDate, formatTimeRange, JST } from "@/lib/date";
import { cn } from "@/lib/utils";
import { deleteWatch, toggleActive } from "../actions";

export type WatchItem = {
  id: string;
  is_active: boolean;
  notify_line: boolean;
  notify_email: boolean;
  created_at: string;
  watch_schedules: Array<{
    id: string;
    target_date: string | null;
    time_from: string | null;
    time_to: string | null;
  }>;
  therapists: {
    id: string;
    name: string;
    image_url: string | null;
    profile_url: string | null;
    /**
     * 外部ポータル (men-esthe.jp) 由来のリッチ情報。
     * Supabase のリレーション展開 `external_therapists (...)` の戻り値。
     * - 既存セラピストは未リンクのことがあるため null も許容する。
     * - 1:1 だが PostgREST が配列で返すケースもあるためどちらも許容。
     */
    external_therapists:
      | {
          primary_image_url: string | null;
          display_name: string | null;
          age: number | null;
          style_raw: string | null;
        }
      | Array<{
          primary_image_url: string | null;
          display_name: string | null;
          age: number | null;
          style_raw: string | null;
        }>
      | null;
    salons: {
      id: string;
      name: string;
      url: string | null;
      sites: { id: string };
    };
  };
  next_available_slot: { date: string; start_time: string } | null;
};

function pickExternal(
  ext: WatchItem["therapists"]["external_therapists"],
):
  | {
      primary_image_url: string | null;
      display_name: string | null;
      age: number | null;
      style_raw: string | null;
    }
  | null {
  if (!ext) return null;
  return Array.isArray(ext) ? (ext[0] ?? null) : ext;
}

function getDisplayName(item: WatchItem): string {
  return pickExternal(item.therapists.external_therapists)?.display_name ?? item.therapists.name;
}

/**
 * 次回出勤枠を比較用のキー（`YYYY-MM-DDTHH:mm:ss`）に変換する。
 * いずれも JST 前提なので文字列の辞書順比較で時系列と一致する。
 * 空き枠が無い場合は null（並びの末尾扱い）。
 */
function slotSortKey(item: WatchItem): string | null {
  const slot = item.next_available_slot;
  if (!slot) return null;
  return `${slot.date}T${slot.start_time}`;
}

const SORT_OPTIONS = [
  { value: "created_desc", label: "登録順" },
  { value: "soonest", label: "出勤順" },
  { value: "name", label: "名前順" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

const DEFAULT_SORT: SortKey = "created_desc";
const SORT_STORAGE_KEY = "watches:sort";

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value);
}

function sortItems(items: WatchItem[], sort: SortKey): WatchItem[] {
  const sorted = [...items];
  switch (sort) {
    case "created_desc":
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      break;
    case "soonest":
      sorted.sort((a, b) => {
        const ka = slotSortKey(a);
        const kb = slotSortKey(b);
        // 空き枠が無いものは末尾に寄せ、その中では登録が新しい順。
        if (ka === null && kb === null) return b.created_at.localeCompare(a.created_at);
        if (ka === null) return 1;
        if (kb === null) return -1;
        if (ka !== kb) return ka.localeCompare(kb);
        return b.created_at.localeCompare(a.created_at);
      });
      break;
    case "name":
      sorted.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), "ja"));
      break;
  }
  return sorted;
}

// 並び順は localStorage に保持し、再訪時にも復元する。
// useSyncExternalStore でハイドレーション時はサーバ既定値を使い、不一致を避ける。
const sortListeners = new Set<() => void>();

function subscribeSort(callback: () => void) {
  sortListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    sortListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readStoredSort(): SortKey {
  const stored = window.localStorage.getItem(SORT_STORAGE_KEY);
  return isSortKey(stored) ? stored : DEFAULT_SORT;
}

function useSortPreference(): [SortKey, (value: SortKey) => void] {
  const sort = useSyncExternalStore(
    subscribeSort,
    readStoredSort,
    () => DEFAULT_SORT,
  );
  const setSort = (value: SortKey) => {
    window.localStorage.setItem(SORT_STORAGE_KEY, value);
    for (const listener of sortListeners) listener();
  };
  return [sort, setSort];
}

type OptimisticAction =
  | { type: "toggle"; id: string; is_active: boolean }
  | { type: "delete"; id: string };

function resolveTherapistImageSrc(
  imageUrl: string | null,
  profileUrl: string | null,
): string | null {
  if (!imageUrl?.trim()) return null;
  const trimmed = imageUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!profileUrl) return null;
  try {
    return new URL(trimmed, profileUrl).href;
  } catch {
    return null;
  }
}

export function WatchList({ items }: { items: WatchItem[] }) {
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (state, action: OptimisticAction) => {
      if (action.type === "toggle") {
        return state.map((it) =>
          it.id === action.id ? { ...it, is_active: action.is_active } : it,
        );
      }
      if (action.type === "delete") {
        return state.filter((it) => it.id !== action.id);
      }
      return state;
    },
  );

  const [sort, setSort] = useSortPreference();

  const handleSortChange = (value: string) => {
    if (isSortKey(value)) setSort(value);
  };

  const sortedItems = useMemo(
    () => sortItems(optimisticItems, sort),
    [optimisticItems, sort],
  );

  return (
    <div className="space-y-4">
      {optimisticItems.length > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <label
            htmlFor="watch-sort"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowUpDownIcon className="size-3.5" aria-hidden />
            並び替え
          </label>
          <Select value={sort} onValueChange={handleSortChange}>
            <SelectTrigger id="watch-sort" size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <ul className="grid w-full gap-4">
        {sortedItems.map((item) => (
          <WatchRow key={item.id} item={item} onOptimistic={applyOptimistic} />
        ))}
      </ul>
    </div>
  );
}

function WatchRow({
  item,
  onOptimistic,
}: {
  item: WatchItem;
  onOptimistic: (action: OptimisticAction) => void;
}) {
  const [, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleToggle = (next: boolean) => {
    startTransition(async () => {
      onOptimistic({ type: "toggle", id: item.id, is_active: next });
      const res = await toggleActive({ id: item.id, is_active: next });
      if (!res.ok) {
        toast.error(res.message);
        onOptimistic({ type: "toggle", id: item.id, is_active: !next });
      } else {
        toast.success(next ? "監視を有効にしました" : "監視を停止しました");
      }
    });
  };

  const handleConfirmDelete = () => {
    setDeleteDialogOpen(false);
    startTransition(async () => {
      onOptimistic({ type: "delete", id: item.id });
      const res = await deleteWatch({ id: item.id });
      if (!res.ok) {
        toast.error(res.message);
      } else {
        toast.success("監視を削除しました");
      }
    });
  };

  const ext = pickExternal(item.therapists.external_therapists);
  // 外部ポータルの primary_image_url は絶対 URL なのでそのまま。
  // 自社 image_url は予約サイトホストに対する相対パスのことがあるため resolve する。
  const imageSrc =
    ext?.primary_image_url ??
    resolveTherapistImageSrc(item.therapists.image_url, item.therapists.profile_url);
  const displayName = ext?.display_name ?? item.therapists.name;

  return (
    <li className="w-full min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-5">
        <Link
          href={`/watches/${item.id}`}
          aria-label={`${displayName} の詳細を見る`}
          className="group/link flex min-w-0 flex-1 gap-4 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
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
                <UserRoundIcon className="size-7" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="flex items-center gap-1 truncate text-base font-semibold">
              <span className="truncate group-hover/link:underline">
                {displayName}
              </span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/link:translate-x-0.5"
                aria-hidden
              />
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {item.therapists.salons.name}
              {ext?.style_raw ? (
                <span className="ml-2 text-muted-foreground/70">
                  {ext.style_raw}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {item.notify_email || item.notify_line ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {item.notify_email ? (
                    <MailIcon
                      className="size-3.5 shrink-0"
                      aria-label="メール通知"
                    />
                  ) : null}
                  {item.notify_email && item.notify_line ? (
                    <span aria-hidden className="text-muted-foreground">
                      /
                    </span>
                  ) : null}
                  {item.notify_line ? <span>LINE</span> : null}
                </span>
              ) : (
                <span className="text-destructive">通知チャネルが未選択です</span>
              )}
              <NextSlotLabel slot={item.next_available_slot} />
            </div>
          </div>
        </Link>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          <Switch
            aria-label="監視の有効/無効"
            checked={item.is_active}
            onCheckedChange={handleToggle}
            className={cn(
              "data-checked:bg-emerald-600 dark:data-checked:bg-emerald-500",
              "data-unchecked:bg-neutral-300 dark:data-unchecked:bg-neutral-600",
            )}
          />
          <div className="hidden items-center gap-2 sm:flex">
            <Button asChild size="icon" variant="ghost" aria-label="編集">
              <Link href={`/watches/${item.id}/edit`}>
                <PencilIcon className="size-4" />
              </Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="削除"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full sm:hidden"
                aria-label="変更・削除"
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem asChild>
                <Link href={`/watches/${item.id}/edit`}>
                  <PencilIcon className="size-4" />
                  変更
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteDialogOpen(true)}
              >
                <Trash2Icon className="size-4" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>この監視を削除しますか？</DialogTitle>
            <DialogDescription>
              {`「${displayName}」（${item.therapists.salons.name}）の通知予約を削除すると、空き枠の通知は届きません。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {item.watch_schedules.length > 0 ? (
        <>
          <Separator />
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              希望日時
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {item.watch_schedules.map((s) => (
                <li
                  key={s.id}
                  className="rounded-md bg-muted px-2 py-1 text-xs"
                >
                  {s.target_date ? formatJstDate(s.target_date) : "日付指定なし"}
                  {" / "}
                  {formatTimeRange(s.time_from, s.time_to)}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </li>
  );
}

function NextSlotLabel({
  slot,
}: {
  slot: { date: string; start_time: string } | null;
}) {
  if (!slot) {
    return (
      <span className="text-muted-foreground">空きなし</span>
    );
  }

  const time = slot.start_time.slice(0, 5);
  const today = dayjs().tz(JST).format("YYYY-MM-DD");
  const isToday = slot.date === today;

  if (isToday) {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold tabular-nums text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
        本日 {time}〜
      </span>
    );
  }

  const md = dayjs(slot.date).tz(JST).format("M/D");
  return (
    <span className="inline-flex items-center font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
      {md} {time}〜
    </span>
  );
}
