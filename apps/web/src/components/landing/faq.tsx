import type { ReactNode } from "react";
import Link from "next/link";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "サロンのアカウント情報（ログイン情報）を預ける必要はありますか？",
    a: "いいえ、不要です。当サービスは公開されている予約状況のページのみを監視するため、サロンのマイページへのログイン情報をお預かりすることはありません。お客様にご登録いただくのはメールアドレスのみです。",
  },
  {
    q: "通知が来ても予約が取れないことはありますか？",
    a: "あります。空き枠は他の方も狙っているため、通知後すぐに予約しても埋まってしまうことがあります。当サービスは「気付くのを早くする」ことで予約成功率を上げるための補助ツールであり、予約成立そのものを保証するものではありません。",
  },
  {
    q: "個人情報の取り扱いはどうなっていますか？",
    a: (
      <>
        ご登録時にお預かりするのはメールアドレスのみで、サロンへの連絡や第三者への提供は行いません。通知メールも当サービスから直接お送りします。詳細は{" "}
        <Link
          href="/privacy"
          className="font-medium text-primary underline underline-offset-4 hover:no-underline"
        >
          プライバシーポリシー
        </Link>
        をご確認ください。
      </>
    ),
  },
  {
    q: "本当に通知が来る前提で大丈夫？",
    a: "予約サイトの仕様変更や障害がある場合は通知が遅れる・届かない可能性があります。あくまで監視を補助するサービスであり、通知の到達と予約成立を保証するものではありません。",
  },
  {
    q: "解約はどうすればいいですか？",
    a: "ログイン後のアカウントページからいつでも解約できます。解約後も次回請求日まではご利用いただけます。",
  },
  {
    q: "プランごとの違いは？",
    a: "無料プランは監視 1 件・通知は 10 分遅れ、スタンダードは監視 10 件・5 分遅れ、プレミアムは無制限・即時通知です。詳しくは料金プランページをご覧ください。",
  },
  {
    q: "プランの変更はいつでもできますか？",
    a: "はい。アップグレードは即時切替・差額のみの請求で行われ、ダウングレードは現在の請求期間が満了した後に切り替わります。過去の支払い分が無駄になることはありません。",
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
            className="group/faq overflow-hidden rounded-2xl border bg-muted/40 shadow-sm backdrop-blur-sm"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="pr-2">{f.q}</span>
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-lg font-light text-muted-foreground shadow-sm transition-transform duration-200 group-open/faq:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="border-t bg-background/80 px-5 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
