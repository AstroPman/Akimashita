import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TRIAL_DAYS } from "@/lib/stripe/config";
import { getSeatsSnapshot } from "@/lib/seats";
import { cn } from "@/lib/utils";

interface Props {
  size?: "default" | "lg";
  className?: string;
}

/**
 * 残席状況に応じてラベルと遷移先を切り替える主要 CTA。
 *  残席あり → /pricing で料金詳細を見せる
 *  満員    → /waitlist
 */
export async function PrimaryCta({ size = "lg", className }: Props) {
  const seats = await getSeatsSnapshot();
  if (seats.isFull) {
    return (
      <Button asChild size={size} className={cn(className)}>
        <Link href="/waitlist">ウェイトリストに登録する</Link>
      </Button>
    );
  }
  return (
    <Button asChild size={size} className={cn(className)}>
      <Link href="/pricing">
        {TRIAL_DAYS} 日間無料で試す
      </Link>
    </Button>
  );
}

export function SecondaryCta({ size = "lg", className }: Props) {
  return (
    <Button asChild size={size} variant="outline" className={cn(className)}>
      <Link href="/login">ログイン</Link>
    </Button>
  );
}
