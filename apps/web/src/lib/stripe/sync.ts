import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "./server";
import type { Plan } from "./config";

interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  plan: Plan | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Stripe の Subscription を DB の subscriptions に upsert する。
 * Webhook と Checkout 成功直後の両方から呼べるよう冪等に作っている。
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
  const plan = matchPlanByPriceId(priceId);

  const row: SubscriptionRow = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    plan,
    current_period_end: timestampToIso(
      // Stripe SDK の型では subscription.current_period_end は number（unix 秒）
      // だが、API バージョンによって項目位置が変わる場合がある。両対応のため item 側もフォールバックする。
      (subscription as unknown as { current_period_end?: number }).current_period_end ??
        item?.current_period_end ??
        null,
    ),
    trial_end: timestampToIso(subscription.trial_end ?? null),
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(`subscriptions の upsert に失敗: ${error.message}`);
  }
}

/**
 * 削除イベント。Stripe 側で完全に消えたサブスクの行を canceled に更新する。
 * （行自体は残しておき、再加入時に上書き利用する）
 */
export async function markSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
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

function matchPlanByPriceId(priceId: string | undefined | null): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY) return "monthly";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY) return "yearly";
  return null;
}

function timestampToIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * 既存の Customer を email から検索、無ければ新規作成する。
 * 1ユーザに1顧客しか作らないようにするためのヘルパー。
 */
export async function ensureStripeCustomer(args: {
  userId: string;
  email: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripe();

  if (args.existingCustomerId) {
    return args.existingCustomerId;
  }

  // 既存検索
  const list = await stripe.customers.list({ email: args.email, limit: 1 });
  const existing = list.data[0];
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
