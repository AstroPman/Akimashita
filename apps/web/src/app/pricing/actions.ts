"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import {
  TRIAL_DAYS,
  getPriceIdFor,
  isPlan,
  type Plan,
} from "@/lib/stripe/config";
import { ensureStripeCustomer } from "@/lib/stripe/sync";
import { tryReserveSeat } from "@/lib/seats";

interface InviteRow {
  id: string;
  email: string;
  invite_expires_at: string | null;
  signed_up_at: string | null;
}

/**
 * 招待トークンを検証する。有効なら waitlist 行を返す。
 * 有効条件: signed_up_at が null かつ invite_expires_at が未到来。
 */
async function validateInvite(token: string | null): Promise<InviteRow | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("waitlist")
    .select("id, email, invite_expires_at, signed_up_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (!data) return null;
  if (data.signed_up_at) return null;
  if (
    data.invite_expires_at &&
    new Date(data.invite_expires_at).getTime() < Date.now()
  ) {
    return null;
  }
  return data as InviteRow;
}

/**
 * 「このプランで始める」ボタンから呼ばれる。Stripe Checkout の URL を生成して
 * リダイレクトする。途中で /signup や /waitlist に飛ばす分岐もここで担う。
 *
 * invite トークンが渡されていて有効なら、席数上限を超えていても通す（招待枠）。
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const planRaw = formData.get("plan");
  if (!isPlan(planRaw)) {
    throw new Error("不正なプランです");
  }
  const plan: Plan = planRaw;
  const inviteToken = (formData.get("invite") as string | null) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログインなら signup → 戻り先を保持
  if (!user) {
    const nextUrl = inviteToken
      ? `/pricing?plan=${plan}&invite=${encodeURIComponent(inviteToken)}`
      : `/pricing?plan=${plan}`;
    redirect(`/signup?next=${encodeURIComponent(nextUrl)}`);
  }

  const invite = await validateInvite(inviteToken);

  // 席数チェック → 仮押さえ。招待トークン有効なら超過してでも通す。
  if (!invite) {
    const reserved = await tryReserveSeat(user.id);
    if (!reserved) {
      redirect("/waitlist?reason=full");
    }
  } else {
    // 招待でも subscriptions 行は作っておく（Webhook で正しく upsert されるための準備）。
    const admin = createAdminClient();
    await admin
      .from("subscriptions")
      .upsert({ user_id: user.id, status: "incomplete" }, { onConflict: "user_id" });
    // 招待を使い切ったことを記録
    await admin
      .from("waitlist")
      .update({ signed_up_at: new Date().toISOString() })
      .eq("id", invite.id);
  }

  const admin = createAdminClient();

  // 既存の subscriptions 行（incomplete を含む）を取得
  const { data: existingRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  // すでに有効な契約があるならアプリへ送る
  if (
    existingRow &&
    ["trialing", "active", "past_due"].includes(existingRow.status)
  ) {
    redirect("/watches");
  }

  // Stripe Customer を確保し、subscriptions に保存しておく
  const customerId = await ensureStripeCustomer({
    userId: user.id,
    email: user.email ?? "",
    existingCustomerId: existingRow?.stripe_customer_id ?? null,
  });
  if (existingRow?.stripe_customer_id !== customerId) {
    await admin
      .from("subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${protocol}://${host}` : "";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: getPriceIdFor(plan), quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { user_id: user.id, plan },
    },
    payment_method_collection: "always",
    allow_promotion_codes: true,
    locale: "ja",
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel`,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan },
  });

  if (!session.url) {
    throw new Error("Checkout セッションの URL を取得できませんでした");
  }
  redirect(session.url);
}
