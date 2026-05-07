"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  UpdateEmailSchema,
  DeleteAccountSchema,
} from "@/lib/schema/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";

export type AccountActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** 完了状態を UI で出し分けるためのキー */
  done?: "email_sent" | "deleted" | "reset_email_sent";
};

// Supabase のエラー詳細はサーバーログに残しつつ、開発時のみクライアントへ返す。
function failure(
  message: string,
  error: unknown,
): AccountActionState {
  console.error(`[account] ${message}`, error);
  if (process.env.NODE_ENV !== "production" && error && typeof error === "object") {
    const e = error as { message?: string; code?: string };
    const detail = [e.code, e.message].filter(Boolean).join(" / ");
    if (detail) return { ok: false, message: `${message}: ${detail}` };
  }
  return { ok: false, message };
}

async function getOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : undefined;
}

export async function updateEmailAction(
  _prev: AccountActionState | undefined,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = UpdateEmailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  if (user.email && user.email.toLowerCase() === parsed.data.email.toLowerCase()) {
    return {
      ok: false,
      message: "現在のメールアドレスと同じです",
      fieldErrors: { email: ["現在のメールアドレスと同じです"] },
    };
  }

  const origin = await getOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    origin ? { emailRedirectTo: `${origin}/auth/callback?next=/account` } : undefined,
  );

  if (error) {
    return failure("メールアドレスの変更に失敗しました", error);
  }

  return { ok: true, done: "email_sent" };
}

export async function sendPasswordResetEmailAction(): Promise<AccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, message: "ログインが必要です" };
  }

  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: origin
      ? `${origin}/auth/callback?next=/reset-password`
      : undefined,
  });

  if (error) {
    return failure("リセットメールの送信に失敗しました", error);
  }

  return { ok: true, done: "reset_email_sent" };
}

export async function deleteAccountAction(
  _prev: AccountActionState | undefined,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = DeleteAccountSchema.safeParse({
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return failure("削除処理を初期化できませんでした", error);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return failure("アカウントの削除に失敗しました", deleteError);
  }

  // auth.users 削除に伴い session は無効化されているが、
  // ブラウザ側の Cookie をクリアするため明示的に signOut も呼ぶ。
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login?deleted=1");
}

/**
 * Stripe Customer Portal セッションを作って外部にリダイレクト。
 * プラン変更・カード変更・解約はすべて Stripe 側 UI に委譲する。
 */
export async function openCustomerPortalAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const customerId = row?.stripe_customer_id ?? null;
  if (!customerId) {
    redirect("/pricing");
  }

  const origin = await getOrigin();
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: origin ? `${origin}/account` : undefined,
    locale: "ja",
  });
  redirect(session.url);
}
