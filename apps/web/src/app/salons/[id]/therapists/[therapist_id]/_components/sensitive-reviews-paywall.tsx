"use client";

import Link from "next/link";
import { LockKeyholeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";

interface SensitiveReviewsPaywallProps {
  therapistId: string;
  /** 未表示の paid_only レビュー件数。0 のときは表示しない想定。 */
  count: number;
  isAuthenticated: boolean;
}

/**
 * 未課金ユーザに対して「sensitive な口コミが N 件存在する」ことだけを伝え、
 * 中身は一切 HTML に出さない paywall カード。
 *
 * - 件数だけ表示し、ぼかし要素も「●●●」のような単なるダミー UI に留める。
 *   実際の本文・タグ・slug は props にも入っていないため SSR HTML には
 *   隠語が漏れない。
 * - クリック時に `paywall_sensitive_review_clicked` を analytics に送る。
 */
export function SensitiveReviewsPaywall({
  therapistId,
  count,
  isAuthenticated,
}: SensitiveReviewsPaywallProps) {
  const ctaHref = isAuthenticated
    ? "/pricing?reason=sensitive_reviews"
    : "/signup";
  const ctaLabel = isAuthenticated
    ? "有料プランで口コミを見る"
    : "登録すると口コミが見られます";

  return (
    <div className="overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-amber-900/20">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-200/60 p-2 dark:bg-amber-900/40">
          <LockKeyholeIcon
            className="size-4 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              タグ付きの限定口コミが {count} 件あります
            </p>
            <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/80">
              閲覧には有料プランの登録が必要です。
            </p>
          </div>

          {/* 件数表示専用のぼかしダミー。実テキストは含まない。 */}
          <div aria-hidden className="select-none space-y-2 pt-1 blur-[3px]">
            <div className="h-3 w-full rounded bg-amber-200/70 dark:bg-amber-800/50" />
            <div className="h-3 w-5/6 rounded bg-amber-200/70 dark:bg-amber-800/50" />
            <div className="h-3 w-2/3 rounded bg-amber-200/70 dark:bg-amber-800/50" />
          </div>

          <Button
            asChild
            size="sm"
            variant="default"
            className="bg-amber-700 text-amber-50 hover:bg-amber-800"
          >
            <Link
              href={ctaHref}
              onClick={() => {
                track("paywall_sensitive_review_clicked", {
                  therapist_id: therapistId,
                  count,
                });
              }}
              className="gap-1.5"
            >
              <LockKeyholeIcon className="size-3.5" aria-hidden />
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
