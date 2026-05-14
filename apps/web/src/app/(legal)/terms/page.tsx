import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約",
};

export default function TermsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">利用規約</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        最終更新日: {new Date().toISOString().slice(0, 10)}
      </p>

      <p className="mt-6 text-sm leading-7">
        本利用規約（以下「本規約」）は、アキマシタ（以下「本サービス」）の提供条件および
        本サービスを利用する利用者（以下「利用者」）と運営者の間の権利義務関係を定めます。
        本サービスの利用にあたっては、本規約の全文をお読みいただいた上、本規約に同意いただく必要があります。
      </p>

      <h2 className="mt-10 text-xl font-semibold">第 1 条（適用）</h2>
      <p className="mt-3 text-sm leading-7">
        本規約は、利用者と運営者との間の本サービスの利用に関わる一切の関係に適用されます。
      </p>

      <h2 className="mt-8 text-xl font-semibold">第 2 条（サービス内容）</h2>
      <p className="mt-3 text-sm leading-7">
        本サービスは、利用者が指定したセラピストについて公開されている予約状況を定期的に取得し、
        空き枠が検出された場合にメール等で通知する補助ツールです。本サービスは予約サイト各社とは独立しており、
        通知の到達や予約成立を保証するものではありません。
      </p>
      <p className="mt-3 text-sm leading-7">
        本サービスは、空き枠の検出から通知の送信までをおおむね5分以内とすることを運用上の目標とします。
        ただし、当該目標は努力目標であり到達時刻を保証するものではなく、予約サイト側の仕様変更・障害、
        インターネット接続やメール配信経路の混雑・遅延、利用者の通信環境・端末・メールソフトの設定・
        迷惑メールフォルダへの振り分け等の外部要因により、目標を超えて通知が遅延することがあります。
      </p>

      <h2 className="mt-8 text-xl font-semibold">第 3 条（料金）</h2>
      <p className="mt-3 text-sm leading-7">
        本サービスは有料サブスクリプションです。お申し込み時にお支払い情報をご登録いただき、
        お選びのプラン・請求サイクル（月額／年額）に基づき自動的に課金されます。
        解約は所定の方法でいつでも可能で、解約後も次回請求日までは引き続き利用できます。
        料金・お支払い・返金の詳細は
        <Link href="/payments" className="underline underline-offset-2">
          お支払いに関するポリシー
        </Link>
        をご参照ください。
      </p>

      <h2 className="mt-8 text-xl font-semibold">第 4 条（禁止事項）</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm leading-7">
        <li>法令または公序良俗に違反する行為</li>
        <li>本サービスの運営を妨害する行為</li>
        <li>他の利用者または第三者の権利を侵害する行為</li>
        <li>不正アクセス、リバースエンジニアリング、スクレイピング等の行為</li>
        <li>本サービスを通じて得た情報を商用目的で第三者に提供する行為</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">第 5 条（免責事項）</h2>
      <p className="mt-3 text-sm leading-7">
        運営者は、本サービスに関して、その完全性・正確性・有用性・特定目的への適合性について保証しません。
        利用者が本サービスを利用したことに起因して生じた損害について、運営者は一切の責任を負いません。
        また、通知の遅延・不到達、通知に関する損害その他、第2条に定める運用上の目標に達しないことに関連して利用者に生じた不利益について、運営者（サービス提供者）は責任を負いません。
      </p>

      <h2 className="mt-8 text-xl font-semibold">第 6 条（規約の変更）</h2>
      <p className="mt-3 text-sm leading-7">
        運営者は必要と判断した場合、利用者へ事前の通知なく本規約を変更できるものとします。
        変更後の規約は本サービス上に掲示された時点から効力を生じます。
      </p>

      <h2 className="mt-8 text-xl font-semibold">第 7 条（準拠法・管轄）</h2>
      <p className="mt-3 text-sm leading-7">
        本規約は日本法に準拠し、本サービスに関して利用者と運営者の間で生じた紛争については、
        運営者所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
      </p>

      <p className="mt-10 text-xs text-muted-foreground">
        ※ 本テンプレートは雛形です。サービス公開前に内容を弁護士等にご確認ください。
      </p>
    </>
  );
}
