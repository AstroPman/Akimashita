import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { syncSubscriptionFromStripe } from "@/lib/stripe/sync";

export const metadata: Metadata = {
  title: "登録完了",
};

/**
 * Stripe Checkout から戻ってくる先。Webhook 反映の遅延に備えて
 * Stripe API から直接 Subscription を取得し DB を同期した上で /watches に送る。
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
      }
    } catch (err) {
      console.error("[checkout.success] 同期失敗", err);
      // 同期に失敗しても Webhook で後追い反映されるので致命ではない
    }
  }

  redirect("/watches");
}
