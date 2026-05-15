import Image from "next/image";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: 1,
    title: "アカウントを作成",
    body: "メールアドレスでアカウントを作成し、プランをお選びいただきます。",
    image: "/landing/step-1-account.png",
    alt: "アカウント作成画面のイメージ",
  },
  {
    n: 2,
    title: "監視するセラピストを登録",
    body: "対応サロンの中からセラピストと、希望日・時間帯を登録します。",
    image: "/landing/step-2-therapists.png",
    alt: "セラピストを選択する画面のイメージ",
  },
  {
    n: 3,
    title: "空きが出たら通知",
    body: "予約サイトを定期巡回し、空き枠を見つけたらメールでお知らせします。",
    image: "/landing/step-3-notification.png",
    alt: "空き枠の通知画面のイメージ",
  },
  {
    n: 4,
    title: "公式サイトで予約",
    body: "通知に含まれるリンクから、各サロンの公式予約ページで予約してください。",
    image: "/landing/step-4-reservation.png",
    alt: "公式サイトの予約画面のイメージ",
  },
] as const;

const BADGE_BG: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-sky-400",
  2: "bg-pink-400",
  3: "bg-violet-400",
  4: "bg-blue-400",
};

export function HowItWorks() {
  return (
    <section
      id="flow"
      className="relative mx-auto w-full max-w-5xl px-4 py-16 sm:py-24"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          ご利用の流れ
        </h2>
      </div>

      <ol className="relative mt-12 flex list-none flex-col gap-12 sm:gap-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-6 bottom-6 hidden w-px -translate-x-1/2 border-l-2 border-dashed border-neutral-200 sm:block"
        />

        {STEPS.map((s, i) => {
          const reversed = i % 2 === 1;
          return (
            <li
              key={s.n}
              className="relative grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr] sm:gap-10"
            >
              <div
                className={cn(
                  "order-2 sm:order-none sm:row-start-1",
                  reversed
                    ? "sm:col-start-3 sm:text-left"
                    : "sm:col-start-1 sm:text-right",
                )}
              >
                <h3 className="text-lg font-bold tracking-tight sm:text-xl">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>

              <div className="order-1 flex justify-center sm:order-none sm:col-start-2 sm:row-start-1">
                <span
                  className={cn(
                    "relative z-10 flex size-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg shadow-black/10 ring-4 ring-white sm:size-14 sm:text-xl",
                    BADGE_BG[s.n as 1 | 2 | 3 | 4],
                  )}
                >
                  {s.n}
                </span>
              </div>

              <div
                className={cn(
                  "order-3 flex justify-center sm:order-none sm:row-start-1",
                  reversed
                    ? "sm:col-start-1 sm:justify-end"
                    : "sm:col-start-3 sm:justify-start",
                )}
              >
                <div className="relative aspect-[9/16] w-[200px] sm:w-[240px]">
                  <Image
                    src={s.image}
                    alt={s.alt}
                    fill
                    sizes="(min-width: 640px) 240px, 200px"
                    className="object-contain"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
