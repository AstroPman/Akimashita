import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function NotificationTimingDisclaimer({ className }: Props) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      本サービスでは、空き枠の検出から通知のお届けまでをおおむね5分以内とするよう目標として運用しています。ただし、これは努力目標であり保証ではありません。予約サイト側の仕様・障害、インターネットやメール配信の遅延、ご利用の通信環境・端末・メール受信設定等の外部要因により遅れることがあり、その遅延に関して運営者（サービス提供者）は責任を負いません。詳しくは
      <Link
        href="/terms"
        className="text-foreground underline underline-offset-2 hover:text-primary"
      >
        利用規約
      </Link>
      をご確認ください。
    </p>
  );
}
