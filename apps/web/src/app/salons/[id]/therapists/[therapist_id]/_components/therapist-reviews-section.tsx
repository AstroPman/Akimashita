import Link from "next/link";
import {
  ChevronRightIcon,
  LockKeyholeIcon,
  MessageSquareIcon,
  StarIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatJstDate } from "@/lib/date";
import type {
  PublicReview,
  ReviewAggregate,
  ReviewTagSummaryItem,
} from "@/lib/reviews";
import { ReviewSubmitDialog } from "./review-submit-dialog";
import { SensitiveReviewsPaywall } from "./sensitive-reviews-paywall";

interface TherapistReviewsSectionProps {
  therapistId: string;
  therapistName: string;
  salonId: string;
  aggregate: ReviewAggregate;
  reviews: PublicReview[];
  tagSummary: ReviewTagSummaryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  isAuthenticated: boolean;
  isPaidUser: boolean;
  hasOwnReview: boolean;
}

/**
 * セラピスト詳細ページに差し込むレビューセクション。
 *
 * - 集計バッジ (平均星 + 件数) と「口コミを書く」ボタン (Dialog) をヘッダに置く
 * - 承認済みタグ chip サマリを表示
 * - 未課金ユーザに対して visibility='paid_only' のレビュー本文・タグは SSR HTML
 *   に含めず、件数とぼかしカード (SensitiveReviewsPaywall) で paywall に誘導
 * - レビュー一覧はサーバ側ページネーション (`?reviews_page=N`) で完結
 */
export function TherapistReviewsSection({
  therapistId,
  therapistName,
  salonId,
  aggregate,
  reviews,
  tagSummary,
  totalCount,
  page,
  pageSize,
  isAuthenticated,
  isPaidUser,
  hasOwnReview,
}: TherapistReviewsSectionProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const detailPath = `/salons/${salonId}/therapists/${therapistId}`;
  const hasAny = totalCount > 0;
  const hasPaywallContent = aggregate.paidOnlyCount > 0 && !isPaidUser;
  // 公開件数 + 限定件数。未課金時は paidOnlyCount は数値だけが渡るので OK。
  const grandTotal = aggregate.reviewCount + aggregate.paidOnlyCount;

  return (
    <section className="mt-8 space-y-3" id="reviews">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          口コミ
          <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
            {grandTotal} 件
          </span>
        </h2>
        <ReviewSubmitDialog
          therapistId={therapistId}
          therapistName={therapistName}
          isAuthenticated={isAuthenticated}
          hasExistingReview={hasOwnReview}
          loginNextPath={`${detailPath}#reviews`}
        />
      </div>

      {aggregate.reviewCount > 0 && aggregate.averageRating !== null && (
        <ReviewAggregateBadge aggregate={aggregate} />
      )}

      <ReviewTagSummary
        tagSummary={tagSummary}
        paidOnlyCount={aggregate.paidOnlyCount}
        isPaidUser={isPaidUser}
      />

      {hasAny ? (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-6">
          <div className="flex items-start gap-3">
            <MessageSquareIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {therapistName} さんの口コミはまだありません
              </p>
              <p className="text-sm text-muted-foreground">
                利用された方の感想は、他の利用者の店舗・セラピスト選びの参考になります。
                ぜひ最初の口コミを投稿してください。
              </p>
            </div>
          </div>
        </div>
      )}

      {hasPaywallContent && (
        <SensitiveReviewsPaywall
          therapistId={therapistId}
          count={aggregate.paidOnlyCount}
          isAuthenticated={isAuthenticated}
        />
      )}

      {totalPages > 1 && (
        <PaginationControls
          basePath={detailPath}
          totalPages={totalPages}
          page={page}
        />
      )}
    </section>
  );
}

function ReviewAggregateBadge({ aggregate }: { aggregate: ReviewAggregate }) {
  const avg = aggregate.averageRating;
  if (avg === null) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
      <StarIcon
        className="size-4 text-yellow-500"
        fill="currentColor"
        strokeWidth={1.5}
      />
      <span className="font-semibold tabular-nums">{avg.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">
        / 5.0 (公開 {aggregate.reviewCount} 件)
      </span>
    </div>
  );
}

function ReviewTagSummary({
  tagSummary,
  paidOnlyCount,
  isPaidUser,
}: {
  tagSummary: ReviewTagSummaryItem[];
  paidOnlyCount: number;
  isPaidUser: boolean;
}) {
  // RPC 側で include_sensitive=false の場合は sensitive 母集団のタグは集計から
  // 外れているが、防衛的にもう一段フィルタを入れる。
  const visible = tagSummary.filter(
    (t) => isPaidUser || t.kind !== "sensitive",
  );

  if (visible.length === 0 && paidOnlyCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.slice(0, 12).map((t) => (
        <Badge
          key={t.id}
          variant={t.kind === "sensitive" ? "outline" : "secondary"}
          className={cn(
            "font-normal",
            t.kind === "sensitive" &&
              "border-amber-400/60 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          {t.label}
          <span className="ml-1 tabular-nums text-muted-foreground">
            {t.count}
          </span>
        </Badge>
      ))}
      {!isPaidUser && paidOnlyCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-amber-400/60 bg-amber-50 font-normal text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <LockKeyholeIcon className="size-3" aria-hidden />
          限定口コミ {paidOnlyCount} 件
        </Badge>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  const author = review.displayName ?? "匿名の利用者";
  const meta = [
    review.visitYearMonth
      ? `${review.visitYearMonth.slice(0, 7).replace("-", "/")} 訪問`
      : null,
    review.courseLabel,
    review.coursePriceYen
      ? `¥${review.coursePriceYen.toLocaleString("ja-JP")}`
      : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4",
        review.visibility === "paid_only" &&
          "border-amber-400/60 ring-1 ring-amber-200/40 dark:ring-amber-800/30",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.ratingOverall} />
        <span className="text-sm font-medium">{author}</span>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {formatJstDate(review.createdAt)}
        </span>
        {review.visibility === "paid_only" && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-400/60 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <LockKeyholeIcon className="size-3" aria-hidden />
            有料限定
          </Badge>
        )}
      </header>

      {meta.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {meta.join(" / ")}
        </p>
      )}

      {review.body ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/90">
          {review.body}
        </p>
      ) : null}

      {review.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {review.tags.map((t) => (
            <Badge
              key={t.id}
              variant={t.kind === "sensitive" ? "outline" : "secondary"}
              className={cn(
                "font-normal",
                t.kind === "sensitive" &&
                  "border-amber-400/60 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
              )}
            >
              {t.label}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`評価 ${rating} / 5`}
      className="inline-flex items-center"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon
          key={i}
          className={cn(
            "size-4",
            i <= rating ? "text-yellow-500" : "text-muted-foreground/40",
          )}
          fill={i <= rating ? "currentColor" : "none"}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
    </span>
  );
}

function PaginationControls({
  basePath,
  totalPages,
  page,
}: {
  basePath: string;
  totalPages: number;
  page: number;
}) {
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const buildHref = (p: number) =>
    p <= 1 ? `${basePath}#reviews` : `${basePath}?reviews_page=${p}#reviews`;

  return (
    <nav
      aria-label="口コミのページ送り"
      className="flex items-center justify-between pt-2"
    >
      <Button
        asChild={Boolean(prev)}
        variant="outline"
        size="sm"
        disabled={!prev}
        className="gap-1"
      >
        {prev ? (
          <Link href={buildHref(prev)}>
            <ChevronRightIcon className="size-4 rotate-180" />
            前へ
          </Link>
        ) : (
          <span>
            <ChevronRightIcon className="size-4 rotate-180" />
            前へ
          </span>
        )}
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>
      <Button
        asChild={Boolean(next)}
        variant="outline"
        size="sm"
        disabled={!next}
        className="gap-1"
      >
        {next ? (
          <Link href={buildHref(next)}>
            次へ
            <ChevronRightIcon className="size-4" />
          </Link>
        ) : (
          <span>
            次へ
            <ChevronRightIcon className="size-4" />
          </span>
        )}
      </Button>
    </nav>
  );
}
