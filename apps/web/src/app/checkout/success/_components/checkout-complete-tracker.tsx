"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { track } from "@/lib/analytics/track";
import type { BillingCycle, PaidTier } from "@/lib/plans";

/**
 * Stripe Checkout 成立後に表示される薄いクライアントコンポーネント。
 *
 * `/checkout/success` の server 処理 (Subscription 同期) が完了したあと、
 * `checkout_completed` を 1 度だけ発火し、`/watches` に遷移する。
 * 既存ユーザ体験 (即時 /watches へ移動) は維持したまま計測だけ挟む。
 */
export function CheckoutCompleteTracker(props: {
  tier: PaidTier | "unknown";
  cycle: BillingCycle | "unknown";
}) {
  const router = useRouter();

  useEffect(() => {
    track("checkout_completed", { tier: props.tier, cycle: props.cycle });
    router.replace("/watches");
  }, [props.tier, props.cycle, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">登録を完了しています…</p>
    </div>
  );
}
