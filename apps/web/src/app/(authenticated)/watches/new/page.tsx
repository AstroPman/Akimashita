import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchForm } from "../_components/watch-form";
import { WatchQuotaIndicator } from "../_components/watch-quota-indicator";
import { defaultWatchFormValues } from "@/lib/schema/watch";
import { getWatchQuota } from "@/lib/watches/quota";
import { getPublicSalons } from "@/lib/salons";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "新しく登録",
};

interface PageProps {
  searchParams: Promise<{ therapist_id?: string }>;
}

/**
 * /salons/[id] の「監視に追加」ボタンから飛んできた場合、
 * `?therapist_id=...` を解決してフォームの初期サロン/セラピストを埋める。
 * - 不正な UUID / 削除済み / 退店済みは無視 (空フォームで開始)。
 * - 認証必須レイアウト配下なので RLS は問題なく通るが、therapists は anon でも
 *   select 可なので server client で十分。
 */
async function resolveInitialTherapist(
  rawId: string | undefined,
): Promise<{
  salonId: string;
  therapist: { id: string; name: string };
} | null> {
  if (!rawId) return null;
  // UUID 以外は弾く (DB クエリで型エラーを起こさないため)。
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapists")
    .select("id, name, salon_id, deleted_at")
    .eq("id", rawId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; name: string; salon_id: string };
  return { salonId: row.salon_id, therapist: { id: row.id, name: row.name } };
}

export default async function NewWatchPage({ searchParams }: PageProps) {
  const { therapist_id: rawTherapistId } = await searchParams;

  const [salons, quota, initial] = await Promise.all([
    getPublicSalons(),
    getWatchQuota(),
    resolveInitialTherapist(rawTherapistId),
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
          initialSalonId={initial?.salonId}
          initialTherapist={initial?.therapist}
          defaultValues={
            initial
              ? { ...defaultWatchFormValues, therapist_id: initial.therapist.id }
              : defaultWatchFormValues
          }
        />
      )}
    </div>
  );
}
