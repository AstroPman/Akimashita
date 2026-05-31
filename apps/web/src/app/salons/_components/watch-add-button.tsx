"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BellPlusIcon, MailIcon, SearchCheckIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { track } from "@/lib/analytics/track";
import type { WatchCtaPlacement } from "@/lib/analytics/events";

type ButtonVariants = VariantProps<typeof buttonVariants>;

type Props = {
  therapistId: string;
  /** モーダル本文で「〜の予約サイトを…」と差し込むセラピスト名。 */
  therapistName: string;
  /** Server Component 側で判定したセッションの有無。 */
  isAuthenticated: boolean;
  /** watch ファネル計測用の CTA 設置場所。 */
  placement: WatchCtaPlacement;
  size?: ButtonVariants["size"];
  variant?: ButtonVariants["variant"];
  className?: string;
  /** icon-only 時など、視覚テキストが無いケースで指定する。 */
  ariaLabel?: string;
  children: ReactNode;
};

function buildWatchHref(therapistId: string): string {
  return `/watches/new?therapist_id=${encodeURIComponent(therapistId)}`;
}

/**
 * 「空き通知に追加」CTA の共通コンポーネント。
 *
 * - ログイン済み: そのまま `/watches/new?therapist_id=...` へ遷移する `Link`。
 * - 未ログイン: クリックでモーダルを開き、サービス説明とサインアップ導線を見せる。
 *   いきなり `/login` に飛ばすと「このサービスは何？」が伝わらないため。
 *
 * `(authenticated)` レイアウトと middleware が未ログインアクセスを `/login` に
 * リダイレクトする実装は維持。あくまで「公開ページ上の CTA」の体験を改善する。
 */
export function WatchAddButton({
  therapistId,
  therapistName,
  isAuthenticated,
  placement,
  size,
  variant,
  className,
  ariaLabel,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const watchHref = buildWatchHref(therapistId);

  if (isAuthenticated) {
    return (
      <Button asChild size={size} variant={variant} className={className}>
        <Link
          href={watchHref}
          aria-label={ariaLabel}
          onClick={() =>
            track("watch_cta_clicked", {
              therapist_id: therapistId,
              placement,
              authenticated: true,
            })
          }
        >
          {children}
        </Link>
      </Button>
    );
  }

  const signupHref = `/signup?next=${encodeURIComponent(watchHref)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(watchHref)}`;

  // 未ログイン: クリックで「説明モーダルが開く」ことが価値なので、CTA クリックと
  // モーダル表示を 1 クリック内で連続発火させ、後段 (signup) との脱落を測る。
  const handleOpen = () => {
    track("watch_cta_clicked", {
      therapist_id: therapistId,
      placement,
      authenticated: false,
    });
    track("watch_explainer_viewed", {
      therapist_id: therapistId,
      placement,
    });
    setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        aria-label={ariaLabel}
        onClick={handleOpen}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <div className="relative aspect-[3/2] w-full bg-gradient-to-br from-pink-50 via-white to-violet-50">
            <Image
              src="/landing/watch-explainer.webp"
              alt="セラピストを登録するとアキマシタが 24 時間予約サイトを監視し、空き枠が出た瞬間にメール通知が届く流れのイラスト"
              fill
              sizes="(min-width: 640px) 512px, 90vw"
              className="object-contain"
            />
          </div>

          <div className="space-y-5 p-5 pb-6 sm:p-6 sm:pb-7">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-base sm:text-lg">
                「空き通知」を登録すると、こうなります
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                <span className="font-semibold text-foreground">
                  {therapistName}
                </span>{" "}
                の予約サイトを アキマシタ が 24 時間自動でチェックし、空き枠が出た瞬間にメールでお知らせするサービスです。
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BellPlusIcon className="size-3.5" aria-hidden />
                </span>
                <span>
                  <span className="font-medium">登録</span>
                  <span className="text-muted-foreground">
                    : セラピストと希望日・時間帯を選ぶだけ
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <SearchCheckIcon className="size-3.5" aria-hidden />
                </span>
                <span>
                  <span className="font-medium">監視</span>
                  <span className="text-muted-foreground">
                    : アキマシタが予約サイトを 1 分間隔で巡回
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MailIcon className="size-3.5" aria-hidden />
                </span>
                <span>
                  <span className="font-medium">通知</span>
                  <span className="text-muted-foreground">
                    : 空きが出た瞬間にメールが届く（無料プランで利用可）
                  </span>
                </span>
              </li>
            </ul>

            <div className="space-y-2">
              <Button asChild size="lg" className="w-full">
                <Link
                  href={signupHref}
                  onClick={() =>
                    track("watch_explainer_signup_clicked", {
                      therapist_id: therapistId,
                      placement,
                    })
                  }
                >
                  無料でアカウントを作成（1 分）
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                すでにアカウントをお持ちの方は{" "}
                <Link
                  href={loginHref}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  ログイン
                </Link>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
