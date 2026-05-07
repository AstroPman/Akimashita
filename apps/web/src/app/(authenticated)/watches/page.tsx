import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getWatchQuota } from "@/lib/watches/quota";
import { WatchList, type WatchItem } from "./_components/watch-list";
import { WatchQuotaIndicator } from "./_components/watch-quota-indicator";

export const metadata: Metadata = {
  title: "通知予約リスト",
};

export default async function WatchesPage() {
  const supabase = await createClient();

  const [{ data, error }, quota] = await Promise.all([
    supabase
      .from("watch_settings")
      .select(
        `
        id,
        is_active,
        notify_line,
        notify_email,
        created_at,
        watch_schedules (id, target_date, time_from, time_to),
        therapists!inner (
          id, name, image_url, profile_url,
          salons!inner (
            id, name, url,
            sites!inner (id)
          )
        )
      `,
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    getWatchQuota(),
  ]);

  const items: WatchItem[] = ((data ?? []) as unknown as WatchItem[]).map(
    (w) => ({
      ...w,
      watch_schedules: [...(w.watch_schedules ?? [])].sort((a, b) => {
        const ad = a.target_date ?? "";
        const bd = b.target_date ?? "";
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.time_from ?? "").localeCompare(b.time_from ?? "");
      }),
    }),
  );

  return (
    <div className="space-y-6 pb-24 sm:pb-0">
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 pb-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">通知予約リスト</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              登録したセラピストの空き枠が出たら通知されます。
            </p>
          </div>
          {quota.isFull ? (
            <Button
              type="button"
              disabled
              className="hidden shrink-0 sm:inline-flex"
              aria-label="監視設定の上限に達しています"
            >
              上限に達しています
            </Button>
          ) : (
            <Button asChild className="hidden shrink-0 sm:inline-flex">
              <Link href="/watches/new" className="gap-1.5">
                <PlusIcon className="size-4" />
                新しく登録
              </Link>
            </Button>
          )}
        </div>
      </div>

      <WatchQuotaIndicator quota={quota} />

      {error ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
          一覧の取得に失敗しました: {error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            まだ監視がありません。気になるセラピストを登録しましょう。
          </p>
          {!quota.isFull ? (
            <Button asChild className="mt-4 hidden sm:inline-flex">
              <Link href="/watches/new">新しく登録</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <WatchList items={items} />
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:hidden">
        {quota.isFull ? (
          <Button type="button" disabled className="w-full">
            上限に達しています
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link href="/watches/new" className="gap-1.5">
              <PlusIcon className="size-4" />
              新しく登録
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
