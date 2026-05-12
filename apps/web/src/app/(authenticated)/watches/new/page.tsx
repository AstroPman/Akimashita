import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchForm } from "../_components/watch-form";
import { WatchQuotaIndicator } from "../_components/watch-quota-indicator";
import { defaultWatchFormValues } from "@/lib/schema/watch";
import { getWatchQuota } from "@/lib/watches/quota";
import { getPublicSalons } from "@/lib/salons";

export const metadata: Metadata = {
  title: "新しく登録",
};

export default async function NewWatchPage() {
  const [salons, quota] = await Promise.all([
    getPublicSalons(),
    getWatchQuota(),
  ]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1">
        <Link href="/watches">
          <ChevronLeftIcon className="size-4" />
          一覧に戻る
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">新しく登録</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          サロン・セラピストを選び、通知チャネルと希望日時を設定してください。
        </p>
      </div>

      <WatchQuotaIndicator quota={quota} />

      {quota.isFull ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
          <h2 className="text-base font-semibold text-destructive">
            監視設定の上限に達しています
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            1 アカウントあたり最大 {quota.max} 件まで登録できます。新しく登録するには、一覧から不要な監視を削除してください。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/watches">一覧を確認する</Link>
            </Button>
          </div>
        </div>
      ) : (
        <WatchForm
          mode="create"
          salons={salons.map((s) => ({
            id: s.id,
            name: s.name,
            prefecture: s.prefecture,
            areas: s.areas,
          }))}
          defaultValues={defaultWatchFormValues}
        />
      )}
    </div>
  );
}
