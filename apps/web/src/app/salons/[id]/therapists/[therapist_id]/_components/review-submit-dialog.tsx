"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2Icon, PencilIcon, StarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";
import { REVIEW_RATING_VALUES } from "@/lib/schema/review";
import { submitReviewAction } from "../actions";
import {
  REVIEW_ACTION_INITIAL_STATE,
  type ReviewActionState,
} from "../action-state";

interface ReviewSubmitDialogProps {
  therapistId: string;
  therapistName: string;
  isAuthenticated: boolean;
  /**
   * 既に同一セラピストに対する自分の口コミが存在する場合は true。
   * Dialog を開かず /account/reviews への導線に切り替える。
   */
  hasExistingReview: boolean;
  loginNextPath: string;
  className?: string;
}

/**
 * 口コミ投稿フォーム (Dialog) と、未認証 / 既投稿時の代替ボタンを兼ねるコンポーネント。
 *
 * 早期リターンで別コンポーネントに切り替える設計にすると、Server Action 成功後の
 * `revalidatePath` で `hasExistingReview` が true に切り替わった瞬間に Dialog
 * コンポーネント自体がアンマウントされ、`useActionState` で受けた成功 state が
 * 破棄されて useEffect が走らないという挙動が起きる。toast / router.refresh が
 * 必ず発火するよう、すべての hooks を 1 つのコンポーネント内で呼んでから return 側で
 * 表示分岐する形にしている。
 */
export function ReviewSubmitDialog({
  therapistId,
  therapistName,
  isAuthenticated,
  hasExistingReview,
  loginNextPath,
  className,
}: ReviewSubmitDialogProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [state, formAction] = useActionState<ReviewActionState, FormData>(
    submitReviewAction,
    REVIEW_ACTION_INITIAL_STATE,
  );

  const ratingFieldId = useId();
  const bodyId = useId();
  const visitId = useId();
  const courseId = useId();
  const priceId = useId();
  const nameId = useId();

  useEffect(() => {
    if (state.ok === true) {
      // sonner の description で「公開には承認が必要」という UX 上重要な事実を
      // 二段構成で目立たせる。duration を長めに取って見落とされにくくする。
      toast.success("口コミを投稿しました", {
        description:
          "運営の確認後にセラピスト詳細ページで公開されます。「アカウント設定 → 投稿した口コミ」から公開状況を確認できます。",
        duration: 8000,
      });
      track("review_submitted", {
        therapist_id: state.therapistId,
        rating: state.rating,
        has_body: state.hasBody,
      });
      // Server Action 完了通知に同期して Dialog を閉じ、評価をデフォルトに戻す。
      // 外部 (Server Action の結果) と UI 状態の同期目的なので effect 内 setState を許容する。
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Server Action 完了に同期した UI クローズ
      setOpen(false);
      setRating(5);
    } else if (state.ok === false && state.message) {
      toast.error(state.message);
    }
  }, [state]);

  // 未ログインはログイン誘導ボタンに置き換える。
  // ※ hooks をすべて呼んだあとで return することで、useActionState の state が
  //   親 Server Component の再生成 (revalidatePath 後) でも破棄されない。
  if (!isAuthenticated) {
    return (
      <Button asChild variant="outline" size="sm" className={cn("gap-1.5", className)}>
        <Link href={`/login?next=${encodeURIComponent(loginNextPath)}`}>
          <PencilIcon className="size-4" />
          ログインして口コミを書く
        </Link>
      </Button>
    );
  }

  // 既に投稿済みの場合は編集導線へ。
  if (hasExistingReview) {
    return (
      <Button asChild variant="outline" size="sm" className={cn("gap-1.5", className)}>
        <Link href="/account/reviews">
          <PencilIcon className="size-4" />
          投稿した口コミを管理
        </Link>
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          track("review_form_started", { therapist_id: therapistId });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className={cn("gap-1.5", className)}>
          <PencilIcon className="size-4" />
          口コミを書く
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>口コミを書く</DialogTitle>
          <DialogDescription>
            {therapistName} さんへの口コミを投稿します。投稿は運営の確認後に公開されます。
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="therapist_id" value={therapistId} />
          <input type="hidden" name="rating_overall" value={rating} />

          <div className="space-y-2">
            <Label htmlFor={ratingFieldId}>総合評価 (必須)</Label>
            <RatingPicker
              id={ratingFieldId}
              value={rating}
              onChange={setRating}
            />
            {state.ok === false && state.fieldErrors?.rating_overall?.[0] ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.rating_overall[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={bodyId}>本文 (任意)</Label>
            <Textarea
              id={bodyId}
              name="body"
              placeholder="施術の感想・接客・雰囲気など、自由にお書きください。"
              maxLength={2000}
              rows={5}
              aria-invalid={Boolean(
                state.ok === false && state.fieldErrors?.body,
              )}
            />
            {state.ok === false && state.fieldErrors?.body?.[0] ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.body[0]}
              </p>
            ) : null}
          </div>

          <details className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none text-muted-foreground">
              詳細情報を入力する (任意)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={visitId}>訪問月</Label>
                <Input id={visitId} name="visit_year_month" type="month" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={courseId}>コース名</Label>
                <Input
                  id={courseId}
                  name="course_label"
                  placeholder="90 分など"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={priceId}>料金 (円)</Label>
                <Input
                  id={priceId}
                  name="course_price_yen"
                  type="number"
                  min={0}
                  max={1_000_000}
                  step={100}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={nameId}>表示名</Label>
                <Input
                  id={nameId}
                  name="display_name"
                  placeholder="未入力ならイニシャル表記"
                  maxLength={20}
                />
              </div>
            </div>
          </details>

          <p className="text-xs text-muted-foreground">
            投稿された内容は当サービスの掲載基準に沿って運営が確認のうえ公開します。
            セラピスト個人および所属サロンへの誹謗中傷・違法行為の助長等は掲載されません。
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="gap-1.5">
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      投稿する
    </Button>
  );
}

function RatingPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="総合評価"
      className="flex items-center gap-1"
    >
      {REVIEW_RATING_VALUES.map((star) => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} 点`}
            onClick={() => onChange(star)}
            className={cn(
              "rounded-md p-0.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filled ? "text-yellow-500" : "text-muted-foreground",
              "hover:text-yellow-500",
            )}
          >
            <StarIcon
              className="size-7"
              fill={filled ? "currentColor" : "none"}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm font-medium tabular-nums">{value} / 5</span>
    </div>
  );
}
