"use server";

import { redirect } from "next/navigation";
import { getPublicOrigin } from "@/lib/public-origin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { TRIAL_DAYS } from "@/lib/stripe/config";
import {
  ensureStripeCustomer,
  syncSubscriptionFromStripe,
} from "@/lib/stripe/sync";
import {
  PAID_TIERS,
  PLAN_RANK,
  getPriceId,
  isBillingCycle,
  isPlanTier,
  type BillingCycle,
  type PaidTier,
} from "@/lib/plans";

interface ParsedSelection {
  tier: PaidTier;
  cycle: BillingCycle;
}

function parseSelection(formData: FormData): ParsedSelection {
  const tierRaw = formData.get("tier");
  const cycleRaw = formData.get("cycle");
  if (!isPlanTier(tierRaw) || !(PAID_TIERS as readonly string[]).includes(tierRaw)) {
    throw new Error("不正なプランです");
  }
  if (!isBillingCycle(cycleRaw)) {
    throw new Error("不正な支払い周期です");
  }
  return { tier: tierRaw as PaidTier, cycle: cycleRaw };
}

/**
 * 「このプランで始める」ボタンから呼ばれる。
 *   - 未ログイン        : /signup へ
 *   - 既存有料サブスク有 : changePlanAction と同等の挙動でプラン変更
 *   - その他            : Stripe Checkout を新規作成
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const { tier, cycle } = parseSelection(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextUrl = `/pricing?tier=${tier}&cycle=${cycle}`;
    redirect(`/signup?next=${encodeURIComponent(nextUrl)}`);
  }

  const admin = createAdminClient();

  const { data: existingRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, tier, cycle")
    .eq("user_id", user.id)
    .maybeSingle();

  // 既に有効な契約があるならプラン変更フローへ
  if (
    existingRow?.stripe_subscription_id &&
    ["trialing", "active", "past_due"].includes(existingRow.status)
  ) {
    await changeSubscriptionPlan({
      subscriptionId: existingRow.stripe_subscription_id,
      from: {
        tier: (existingRow.tier ?? "standard") as PaidTier,
        cycle: (existingRow.cycle ?? "monthly") as BillingCycle,
      },
      to: { tier, cycle },
      userId: user.id,
    });
    redirect("/watches");
  }

  const customerId = await ensureStripeCustomer({
    userId: user.id,
    email: user.email ?? "",
    existingCustomerId: existingRow?.stripe_customer_id ?? null,
  });
  if (existingRow?.stripe_customer_id !== customerId) {
    await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          status: "incomplete",
          tier,
          cycle,
        },
        { onConflict: "user_id" },
      );
  }

  const origin = (await getPublicOrigin()) ?? "";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getPriceId(tier, cycle), quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { user_id: user.id, tier, cycle },
    },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    locale: "ja",
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
    client_reference_id: user.id,
    metadata: { user_id: user.id, tier, cycle },
  });

  if (!session.url) {
    throw new Error("Checkout セッションの URL を取得できませんでした");
  }
  redirect(session.url);
}

/**
 * 既存契約のプランを変更する。
 *  - アップグレード   : `proration_behavior: 'always_invoice'` で即時切替＋差額即時請求
 *  - ダウングレード   : 現周期は維持し、`cancel_at_period_end` 相当で次周期から新プラン
 *  - 同一プラン       : 何もしない
 */
async function changeSubscriptionPlan(args: {
  subscriptionId: string;
  from: { tier: PaidTier; cycle: BillingCycle };
  to: { tier: PaidTier; cycle: BillingCycle };
  userId: string;
}): Promise<void> {
  if (args.from.tier === args.to.tier && args.from.cycle === args.to.cycle) {
    return;
  }

  const stripe = getStripe();
  const current = await stripe.subscriptions.retrieve(args.subscriptionId);
  const itemId = current.items.data[0]?.id;
  if (!itemId) {
    throw new Error("Stripe Subscription Item が見つかりません");
  }

  const isUpgrade =
    PLAN_RANK[args.to.tier] > PLAN_RANK[args.from.tier] ||
    (args.from.tier === args.to.tier &&
      args.from.cycle === "monthly" &&
      args.to.cycle === "yearly");

  // アップグレード: 即時切替・日割り課金
  if (isUpgrade) {
    const updated = await stripe.subscriptions.update(args.subscriptionId, {
      items: [{ id: itemId, price: getPriceId(args.to.tier, args.to.cycle) }],
      proration_behavior: "always_invoice",
      metadata: {
        user_id: args.userId,
        tier: args.to.tier,
        cycle: args.to.cycle,
      },
    });
    await syncSubscriptionFromStripe(updated, { userIdHint: args.userId });
    return;
  }

  // ダウングレード（年→月含む）: 現周期は維持し、次回更新で切替
  const updated = await stripe.subscriptions.update(args.subscriptionId, {
    items: [{ id: itemId, price: getPriceId(args.to.tier, args.to.cycle) }],
    proration_behavior: "none",
    billing_cycle_anchor: "unchanged",
    metadata: {
      user_id: args.userId,
      tier: args.to.tier,
      cycle: args.to.cycle,
    },
  });
  await syncSubscriptionFromStripe(updated, { userIdHint: args.userId });
}

/**
 * 「アカウント設定」等から呼べる、明示的なプラン変更アクション。
 * 内部的には startCheckoutAction の途中フローと同じ。
 */
export async function changePlanAction(formData: FormData): Promise<void> {
  const { tier, cycle } = parseSelection(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: existingRow } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status, tier, cycle")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !existingRow?.stripe_subscription_id ||
    !["trialing", "active", "past_due"].includes(existingRow.status)
  ) {
    // 有効な契約が無いなら通常の Checkout フローへ
    const fd = new FormData();
    fd.set("tier", tier);
    fd.set("cycle", cycle);
    await startCheckoutAction(fd);
    return;
  }

  await changeSubscriptionPlan({
    subscriptionId: existingRow.stripe_subscription_id,
    from: {
      tier: (existingRow.tier ?? "standard") as PaidTier,
      cycle: (existingRow.cycle ?? "monthly") as BillingCycle,
    },
    to: { tier, cycle },
    userId: user.id,
  });
  redirect("/account?plan_changed=1");
}
