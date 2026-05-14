import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_CONFIG, type PlanTier } from "@/lib/plans";

/**
 * 無料・スタンダードユーザにアップグレードを促すバナー。
 * /watches ダッシュボードの先頭などに置く。
 */
export function UpgradeBanner({ tier }: { tier: PlanTier }) {
  if (tier === "premium") return null;
  const isFree = tier === "free";
  const headline = isFree
    ? "無料プランをご利用中です"
    : "スタンダードプランをご利用中です";
  const body = isFree
    ? `通知は ${PLAN_CONFIG.free.notifyDelayLabel}・監視枠は 1 件まで。アップグレードで通知がより早く、追加の監視も可能になります。`
    : `通知は ${PLAN_CONFIG.standard.notifyDelayLabel}。プレミアムなら即時通知＋監視数も無制限です。`;
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <SparklesIcon className="size-4" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">{headline}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">{body}</p>
          </div>
        </div>
        <Button asChild size="sm" className="self-start sm:self-auto">
          <Link href="/pricing?source=watches_banner">
            プランを比較する
          </Link>
        </Button>
      </div>
    </div>
  );
}
