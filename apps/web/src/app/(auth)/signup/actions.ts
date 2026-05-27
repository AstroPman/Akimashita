"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SignupSchema } from "@/lib/schema/auth";
import { getPublicOrigin } from "@/lib/public-origin";
import { createClient } from "@/lib/supabase/server";

export type SignupState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<"email" | "password" | "confirmPassword", string[]>
  >;
  emailSent?: boolean;
  /** 確認メールの送信先（確認画面で表示するため）。 */
  sentTo?: string;
};

// アプリ内部のパスのみを許可するためのバリデーション
function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  // プロトコル相対 (//) や 多段リダイレクト防止
  if (value.startsWith("//")) return undefined;
  return value;
}

export async function signupAction(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<"email" | "password" | "confirmPassword", string[]>
      >,
    };
  }

  const supabase = await createClient();
  const origin = await getPublicOrigin();

  const next = safeNext(formData.get("next"));
  const callbackUrl = origin
    ? next
      ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${origin}/auth/callback`
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: callbackUrl ? { emailRedirectTo: callbackUrl } : undefined,
  });

  if (error) {
    return {
      ok: false,
      message: error.message ?? "登録に失敗しました",
    };
  }

  // メール確認が必要な構成では session が返らない
  if (!data.session) {
    return { ok: true, emailSent: true, sentTo: parsed.data.email };
  }

  revalidatePath("/", "layout");
  redirect(next ?? "/pricing");
}
