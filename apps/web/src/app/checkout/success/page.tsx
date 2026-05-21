import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { syncSubscriptionFromStripe } from "@/lib/stripe/sync";
import {
  isBillingCycle,
  PAID_TIERS,
  type BillingCycle,
  type PaidTier,
} from "@/lib/plans";
import { CheckoutCompleteTracker } from "./_components/checkout-complete-tracker";

export const metadata: Metadata = {
  title: "登録完了",
};

/**
 * Stripe Checkout から戻ってくる先。Webhook 反映の遅延に備えて
 * Stripe API から直接 Subscription を取得し DB を同期したうえで、
 * クライアント側で `checkout_completed` を計測してから /watches に遷移する。
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let tier: PaidTier | "unknown" = "unknown";
  let cycle: BillingCycle | "unknown" = "unknown";

  if (session_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["subscription"],
      });

      const subscription =
        typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;

      if (subscription) {
        await syncSubscriptionFromStripe(subscription, { userIdHint: user.id });

        const meta = subscription.metadata ?? {};
        const t = meta.tier;
        const c = meta.cycle;
        if (
          typeof t === "string" &&
          (PAID_TIERS as readonly string[]).includes(t)
        ) {
          tier = t as PaidTier;
        }
        if (isBillingCycle(c)) {
          cycle = c;
        }
      }
    } catch (err) {
      console.error("[checkout.success] 同期失敗", err);
      // 同期に失敗しても Webhook で後追い反映されるので致命ではない
    }
  }

  return <CheckoutCompleteTracker tier={tier} cycle={cycle} />;
}
