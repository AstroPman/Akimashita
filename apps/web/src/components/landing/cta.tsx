import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  size?: "default" | "lg";
  className?: string;
}

/**
 * トップページの主要 CTA。新規登録（無料プラン即時利用可）へ誘導する。
 */
export function PrimaryCta({ size = "lg", className }: Props) {
  return (
    <Button asChild size={size} className={cn(className)}>
      <Link href="/signup">無料で始める</Link>
    </Button>
  );
}

export function SecondaryCta({ size = "lg", className }: Props) {
  return (
    <Button asChild size={size} variant="outline" className={cn(className)}>
      <Link href="/pricing">料金プランを見る</Link>
    </Button>
  );
}
