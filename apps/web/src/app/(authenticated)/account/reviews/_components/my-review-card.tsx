"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronRightIcon,
  Loader2Icon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatJstDate } from "@/lib/date";
import { track } from "@/lib/analytics/track";
import type { MyReview } from "@/lib/reviews";
import { deleteMyReview } from "../actions";

interface MyReviewCardProps {
  review: MyReview;
}

export function MyReviewCard({ review }: MyReviewCardProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const detailHref = review.salonId
    ? `/salons/${review.salonId}/therapists/${review.therapistId}#reviews`
    : null;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteMyReview({ id: review.id });
      if (result.ok) {
        toast.success("口コミを削除しました");
        track("review_deleted", { review_id: review.id });
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <article className="rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={review.ratingOverall} />
            <StatusBadge status={review.status} />
          </div>
          <p className="truncate text-sm font-medium">
            {detailHref ? (
              <Link
                href={detailHref}
                className="inline-flex items-center gap-1 hover:underline"
              >
                {review.therapistName}
                <ChevronRightIcon className="size-3.5" aria-hidden />
              </Link>
            ) : (
              review.therapistName
            )}
          </p>
          {review.salonName ? (
            <p className="text-xs text-muted-foreground">{review.salonName}</p>
          ) : null}
        </div>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
              <span className="sr-only">削除</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>この口コミを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {review.therapistName} さんへの口コミを削除します。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={pending}
                className="gap-1.5"
              >
                {pending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                削除する
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {review.body ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/90">
          {review.body}
        </p>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span suppressHydrationWarning>投稿: {formatJstDate(review.createdAt)}</span>
        {review.visitYearMonth ? (
          <span>
            訪問: {review.visitYearMonth.slice(0, 7).replace("-", "/")}
          </span>
        ) : null}
        {review.courseLabel ? <span>{review.courseLabel}</span> : null}
        {review.coursePriceYen ? (
          <span>¥{review.coursePriceYen.toLocaleString("ja-JP")}</span>
        ) : null}
      </footer>

      {review.status === "rejected" && review.rejectedReason ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          掲載見送り理由: {review.rejectedReason}
        </p>
      ) : null}
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

function StatusBadge({ status }: { status: MyReview["status"] }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="font-normal">
          公開待ち
        </Badge>
      );
    case "published":
      return (
        <Badge variant="default" className="font-normal">
          公開中
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive" className="font-normal">
          掲載見送り
        </Badge>
      );
    case "hidden":
      return (
        <Badge variant="outline" className="font-normal">
          非公開
        </Badge>
      );
  }
}
