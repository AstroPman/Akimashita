"use server";

import { ForgotPasswordSchema } from "@/lib/schema/account";
import { getPublicOrigin } from "@/lib/public-origin";
import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"email", string[]>>;
  emailSent?: boolean;
};

export async function forgotPasswordAction(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<"email", string[]>
      >,
    };
  }

  const supabase = await createClient();
  const origin = await getPublicOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: origin
      ? `${origin}/auth/callback?next=/reset-password`
      : undefined,
  });

  // 存在しないメールアドレスでも success を返してアカウントの存在有無を露出させない。
  if (error) {
    console.error("[forgot-password] resetPasswordForEmail error", error);
  }

  return { ok: true, emailSent: true };
}
