import type { ReactNode } from "react";
import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/stripe/config";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "本当に通知が来る前提で大丈夫？",
    a: "予約サイトの仕様変更や障害がある場合は通知が遅れる・届かない可能性があります。あくまで監視を補助するサービスであり、通知の到達と予約成立を保証するものではありません。",
  },
  {
    q: `${TRIAL_DAYS} 日間の無料トライアル中に料金は発生しますか？`,
    a: `料金は発生しません。お申し込み時にお支払い情報のご登録をお願いしておりますが、${TRIAL_DAYS} 日間は無料でご利用いただけます。${TRIAL_DAYS} 日経過時にお選びのプランで自動課金が始まります。`,
  },
  {
    q: "解約はどうすればいいですか？",
    a: "ログイン後のアカウントページからいつでも解約できます。解約後も次回請求日まではご利用いただけます。",
  },
  {
    q: "なぜ登録数を限定しているのですか？",
    a: "同じ枠を狙う登録者が増えるほど、通知の価値が下がってしまうためです。「通知を受け取った人がきちんと予約できる」ことを優先し、限定人数で運営しています。",
  },
  {
    q: "登録人数の上限はいつも同じですか？",
    a: "いいえ。利用状況・システム負荷・公平な運用の確保などを踏まえ、上限人数は予告なく見直し・変更される場合があります。表示されている人数はあくまで現時点の目安です。",
  },
  {
    q: "満員のときはどうすれば？",
    a: "ウェイトリストにメールアドレスをご登録ください。空きが出次第、先着順でご案内のメールをお送りします。",
  },
  {
    q: "どのメンズエステサロンに対応していますか？",
    a: (
      <>
        メンズエステのうち、順次対応範囲を広げています。対象サロンは{" "}
        <Link
          href="/salons"
          className="font-medium text-primary underline underline-offset-4 hover:no-underline"
        >
          対応サロン一覧
        </Link>
        でご確認いただけます。ご登録後のアプリ内でもご確認いただけます。
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-4 py-16 sm:py-24">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">FAQ</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          サービスについてよくいただく質問です。
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-2">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="group/faq overflow-hidden rounded-2xl border border-neutral-200/90 bg-neutral-50/90 shadow-sm backdrop-blur-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-neutral-800 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="pr-2">{f.q}</span>
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-lg font-light text-neutral-500 shadow-sm transition-transform duration-200 group-open/faq:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="border-t border-neutral-200/80 bg-white/90 px-5 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
