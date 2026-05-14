import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "お支払いに関するポリシー",
  description:
    "アキマシタの料金プラン、決済方法、更新・解約、返金についての方針です。",
};

/** ポリシー文面の基準日（内容変更時はあわせて更新してください） */
const LAST_UPDATED = "2026-05-13";

export default function PaymentsPolicyPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">お支払いに関するポリシー</h1>
      <p className="mt-2 text-sm text-muted-foreground">最終更新日: {LAST_UPDATED}</p>

      <p className="mt-6 text-sm leading-7">
        本ページは、アキマシタ（以下「本サービス」）における料金の発生条件、お支払い方法、
        更新・解約および返金の取り扱いについて定めるものです。
        本サービスのご利用にあたっては、
        <Link href="/terms" className="underline underline-offset-2">
          利用規約
        </Link>
        および本ページをあわせてご確認ください。
      </p>

      <h2 className="mt-10 text-xl font-semibold">1. 料金プラン</h2>
      <p className="mt-3 text-sm leading-7">
        本サービスは、無料プランと、スタンダード／プレミアム各プラン（月額・年額）の有料サブスクリプション（定期課金）により提供されます。
        各プランの金額・内容の詳細は
        <Link href="/pricing" className="underline underline-offset-2">
          料金ページ
        </Link>
        をご覧ください。表示価格は日本円（税込）です。
      </p>
      <p className="mt-3 text-sm leading-7">
        プラン変更時の取扱いは次のとおりです。アップグレード（プレミアムへの切替、または月額から年額への切替）は即時に適用され、
        現在の請求期間における残期間分の差額のみが請求されます。ダウングレードは現在の請求期間が満了した時点で次プランに切り替わり、
        既にお支払い済みの金額が無駄になることはありません。
      </p>

      <h2 className="mt-10 text-xl font-semibold">2. お支払い方法</h2>
      <p className="mt-3 text-sm leading-7">
        クレジットカード等、決済代行業者（Stripe, Inc.）が提供するお支払い手段をご利用いただけます。
        カード番号等の機微なお支払い情報は Stripe 側で取り扱われ、運営者が当該情報を保存することはありません。
      </p>

      <h2 className="mt-10 text-xl font-semibold">3. 契約の更新・解約</h2>
      <p className="mt-3 text-sm leading-7">
        サブスクリプションは、お申し込みのプランに応じた周期（月または年）で自動更新されます。
        解約は、本サービスにログインのうえ「アカウント」から Stripe の顧客ポータルに遷移し、
        所定の手続きによりいつでも行えます。
      </p>
      <p className="mt-3 text-sm leading-7">
        解約手続き完了後も、すでにお支払い済みの当期間の末日（次回請求日の前日まで）までは、
        本サービスを引き続きご利用いただけます。日割りによる利用料の減額は行いません。
      </p>

      <h2 className="mt-10 text-xl font-semibold">4. 料金の改定</h2>
      <p className="mt-3 text-sm leading-7">
        運営者は、本サービスの料金を変更することがあります。変更内容・効力発生時期については、
        利用規約の定めに従い、本サービス上での表示その他運営者が適当と判断する方法により周知します。
      </p>

      <h2 className="mt-10 text-xl font-semibold">5. 領収書・お支払い履歴</h2>
      <p className="mt-3 text-sm leading-7">
        お支払いの明細・領収書は、Stripe の顧客ポータルまたは Stripe が送信する領収書メール等からご確認いただけます。
      </p>

      <h2 className="mt-10 text-xl font-semibold">6. 返金</h2>
      <p className="mt-3 text-sm leading-7">
        原則として、すでに支払われた利用料の返金はいたしません。ただし、法令上返金が義務付けられる場合は、
        その定めに従います。また、重複課金や決済システムの不具合等、運営者の責に帰すべき事由による過誤徴収があった場合は、
        お問い合わせのうえ、運営者が合理的と判断する範囲で対応します。
      </p>

      <h2 className="mt-10 text-xl font-semibold">7. お問い合わせ</h2>
      <p className="mt-3 text-sm leading-7">
        本ポリシーまたはお支払いに関するご質問は、
        <Link href="/contact" className="underline underline-offset-2">
          お問い合わせ
        </Link>
        よりご連絡ください。
      </p>

      <p className="mt-10 text-xs text-muted-foreground">
        ※ 本ページは運用上の方針を示すものです。サービス内容に応じて法務専門家への確認をおすすめします。
      </p>
    </>
  );
}
