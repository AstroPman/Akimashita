import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getMyReviews } from "@/lib/reviews";
import { MyReviewCard } from "./_components/my-review-card";

export const metadata: Metadata = {
  title: "投稿した口コミ",
};

export default async function MyReviewsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // (authenticated) layout がガード済み

  const reviews = await getMyReviews(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">投稿した口コミ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          あなたが投稿した口コミの公開状況を確認できます。掲載までは運営の確認に少々お時間をいただきます。
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">まだ口コミはありません</p>
          <p className="mt-1 text-sm text-muted-foreground">
            セラピスト詳細ページから「口コミを書く」で投稿できます。
          </p>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/salons">サロン・セラピストを探す</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <MyReviewCard review={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
