import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        プライバシーポリシー
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        最終更新日: {new Date().toISOString().slice(0, 10)}
      </p>

      <p className="mt-6 text-sm leading-7">
        アキマシタ（以下「本サービス」）の運営者は、利用者の個人情報を以下のとおり取り扱います。
      </p>

      <h2 className="mt-10 text-xl font-semibold">取得する情報</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm leading-7">
        <li>メールアドレス、ログイン情報</li>
        <li>監視設定（対象セラピスト、希望日時等）</li>
        <li>通知の送信履歴</li>
        <li>お支払い情報（決済代行サービスを通じて取得され、本サービスがカード番号を保持することはありません）</li>
        <li>アクセスログ・Cookie 等の利用情報</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">利用目的</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm leading-7">
        <li>本サービスの提供および機能改善</li>
        <li>通知の送信</li>
        <li>料金の請求およびお支払いに関する案内</li>
        <li>不正利用の防止、お問い合わせ対応</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">第三者提供</h2>
      <p className="mt-3 text-sm leading-7">
        運営者は、法令に基づく場合を除き、利用者の同意を得ず個人情報を第三者に提供しません。
        また、本サービスは Supabase（データベース・認証）、Stripe（決済）、Resend（メール送信）等の
        外部サービスを利用しており、必要な範囲でこれらに情報を委託しています。
      </p>

      <h2 className="mt-8 text-xl font-semibold">情報の管理・保管期間</h2>
      <p className="mt-3 text-sm leading-7">
        取得した個人情報は適切に管理し、利用目的の達成に必要な期間に限り保管します。
        利用者からの削除依頼があった場合には、合理的な期間内に対応いたします。
      </p>

      <h2 className="mt-8 text-xl font-semibold">改定</h2>
      <p className="mt-3 text-sm leading-7">
        本ポリシーの内容は、必要に応じて変更することがあります。重要な変更がある場合は本サービス上で告知します。
      </p>

      <p className="mt-10 text-xs text-muted-foreground">
        ※ 本テンプレートは雛形です。サービス公開前に内容を弁護士等にご確認ください。
      </p>
    </>
  );
}
