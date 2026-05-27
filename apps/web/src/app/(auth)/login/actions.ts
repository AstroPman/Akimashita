"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LoginSchema } from "@/lib/schema/auth";
import { getPublicOrigin } from "@/lib/public-origin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
  /**
   * 入力されたメールアドレスでアカウントは存在するがメール認証が未完了の状態。
   * `true` のときはフォーム側で確認メール再送導線を表示する。
   */
  needsEmailConfirmation?: boolean;
  /** 確認メールの再送先として再表示するためのメールアドレス。 */
  email?: string;
};

// アプリ内部のパスのみを許可するためのバリデーション
function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  return value;
}

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // メール認証未完了のユーザは、Supabase が `email_not_confirmed` を返す。
    // パスワードまで正しく入力できているケースなので、専用メッセージと
    // 再送導線を返してあげるほうが体験が良い。
    if (
      error.code === "email_not_confirmed" ||
      error.message?.toLowerCase().includes("email not confirmed")
    ) {
      return {
        ok: false,
        message: "メール認証が完了していません",
        needsEmailConfirmation: true,
        email: parsed.data.email,
      };
    }
    return {
      ok: false,
      message: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  const redirectTo = formData.get("redirect");
  const target = typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : "/watches";

  revalidatePath("/", "layout");
  redirect(target);
}

export type ResendConfirmationState = {
  ok: boolean;
  message?: string;
};

const ResendSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません"),
});

/**
 * サインアップ時の確認メールを再送する。
 *
 * ユーザ存在の有無を露出させたくないので、結果が成功・失敗いずれの場合も
 * 同一のメッセージを返す（forgot-password と同じポリシー）。
 */
export async function resendConfirmationAction(
  _prev: ResendConfirmationState | undefined,
  formData: FormData,
): Promise<ResendConfirmationState> {
  const parsed = ResendSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      ok: false,
      message: "メールアドレスの形式が正しくありません",
    };
  }

  const supabase = await createClient();
  const origin = await getPublicOrigin();
  const next = safeNext(formData.get("redirect"));
  const callbackUrl = origin
    ? next
      ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${origin}/auth/callback`
    : undefined;

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: callbackUrl ? { emailRedirectTo: callbackUrl } : undefined,
  });

  if (error) {
    console.error("[resend-confirmation] resend error", error);
  }

  return {
    ok: true,
    message: "確認メールを再送しました。受信ボックスをご確認ください。",
  };
}
