import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "./server";
import {
  matchPlanByPriceId,
  type BillingCycle,
  type PaidTier,
} from "@/lib/plans";

interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  tier: PaidTier;
  cycle: BillingCycle;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
}

/** Stripe の subscription.status のうち「有料機能を解禁する」とみなすもの。 */
const PAID_STATUSES = new Set(["trialing", "active", "past_due"]);

/**
 * Stripe の Subscription を DB の subscriptions / users に upsert する。
 * Webhook と Checkout 成功直後の両方から呼べるよう冪等に作っている。
 *
 * users.plan_tier は「有料機能の解禁状態」を表し、Stripe の subscription
 * status が PAID_STATUSES のときだけ standard / premium へ昇格させる。
 * canceled でも current_period_end まで利用させるため、期間内は維持する。
 */
export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  options: { supabase?: SupabaseClient; userIdHint?: string } = {},
): Promise<void> {
  const supabase = options.supabase ?? createAdminClient();
  const stripe = getStripe();

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await resolveUserId({
    stripe,
    supabase,
    customerId,
    hint: options.userIdHint,
  });
  if (!userId) {
    console.warn("[stripe.sync] user_id を解決できませんでした", {
      customer_id: customerId,
      subscription_id: subscription.id,
    });
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  const matched = matchPlanByPriceId(priceId);
  if (!matched) {
    console.warn("[stripe.sync] 既知の Price ID にマッチしませんでした", {
      price_id: priceId,
      subscription_id: subscription.id,
    });
    return;
  }

  const currentPeriodEnd = timestampToIso(
    // SDK の型では subscription.current_period_end は number（unix 秒）
    // だが、API バージョンによって項目位置が変わる場合がある。両対応のため item 側もフォールバックする。
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
      item?.current_period_end ??
      null,
  );

  const row: SubscriptionRow = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    tier: matched.tier,
    cycle: matched.cycle,
    current_period_end: currentPeriodEnd,
    trial_end: timestampToIso(subscription.trial_end ?? null),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(`subscriptions の upsert に失敗: ${error.message}`);
  }

  await applyUserPlanTier(supabase, userId, {
    status: subscription.status,
    tier: matched.tier,
    currentPeriodEnd,
  });
}

/**
 * 削除イベント。Stripe 側で完全に消えたサブスクの行を canceled に更新し、
 * users.plan_tier を free に戻す。
 */
export async function markSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const userId = (existing?.user_id as string | undefined) ?? null;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      stripe_subscription_id: subscription.id,
    })
    .eq("stripe_customer_id", customerId);
  if (error) {
    throw new Error(`subscriptions の canceled 反映に失敗: ${error.message}`);
  }

  if (userId) {
    await supabase.from("users").update({ plan_tier: "free" }).eq("id", userId);
  }
}

/**
 * users.plan_tier の同期。Stripe 状態が「有料」のときのみ standard/premium に
 * 設定する。それ以外は free へ戻す（current_period_end までは canceled で猶予）。
 */
async function applyUserPlanTier(
  supabase: SupabaseClient,
  userId: string,
  args: { status: string; tier: PaidTier; currentPeriodEnd: string | null },
): Promise<void> {
  let nextTier: PaidTier | "free" = "free";
  if (PAID_STATUSES.has(args.status)) {
    nextTier = args.tier;
  } else if (args.status === "canceled") {
    const end = args.currentPeriodEnd
      ? new Date(args.currentPeriodEnd).getTime()
      : 0;
    nextTier = end > Date.now() ? args.tier : "free";
  }

  const { error } = await supabase
    .from("users")
    .update({ plan_tier: nextTier })
    .eq("id", userId);
  if (error) {
    console.error("[stripe.sync] users.plan_tier の更新に失敗", error);
  }
}

/**
 * Customer に紐づくユーザを特定する。
 * 1. metadata.user_id が一番信頼できる（Checkout 作成時にセットする）。
 * 2. 落ち着いて DB の stripe_customer_id 一致行を見る。
 */
async function resolveUserId(args: {
  stripe: Stripe;
  supabase: SupabaseClient;
  customerId: string;
  hint?: string;
}): Promise<string | null> {
  if (args.hint) return args.hint;

  try {
    const customer = await args.stripe.customers.retrieve(args.customerId);
    if (!customer.deleted && customer.metadata?.user_id) {
      return customer.metadata.user_id;
    }
  } catch (err) {
    console.warn("[stripe.sync] customer 取得失敗", err);
  }

  const { data } = await args.supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", args.customerId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

function timestampToIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * 既存の Customer を email から検索、無ければ新規作成する。
 * 1ユーザに1顧客しか作らないようにするためのヘルパー。
 *
 * 既存 ID や email 検索ヒットが Stripe 上で削除済み (`deleted: true`) の場合は
 * 無効とみなし、新規作成にフォールバックする。
 */
export async function ensureStripeCustomer(args: {
  userId: string;
  email: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripe();

  if (args.existingCustomerId) {
    try {
      const retrieved = await stripe.customers.retrieve(args.existingCustomerId);
      if (!retrieved.deleted) {
        return retrieved.id;
      }
      console.warn(
        "[stripe.sync] existingCustomerId が deleted 状態のため新規作成へフォールバック",
        { customer_id: args.existingCustomerId, user_id: args.userId },
      );
    } catch (err) {
      console.warn("[stripe.sync] existingCustomerId の取得に失敗", err);
    }
  }

  // email 検索ヒットでも deleted を弾く（list は基本 deleted を返さないが念のため）
  const list = await stripe.customers.list({ email: args.email, limit: 10 });
  const existing = list.data.find((c) => !c.deleted);
  if (existing) {
    if (existing.metadata?.user_id !== args.userId) {
      await stripe.customers.update(existing.id, {
        metadata: { user_id: args.userId },
      });
    }
    return existing.id;
  }

  const created = await stripe.customers.create({
    email: args.email,
    metadata: { user_id: args.userId },
  });
  return created.id;
}
