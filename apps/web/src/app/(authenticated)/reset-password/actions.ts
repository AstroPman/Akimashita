"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ResetPasswordSchema } from "@/lib/schema/account";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"password" | "confirmPassword", string[]>>;
};

export async function resetPasswordAction(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<"password" | "confirmPassword", string[]>
      >,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      message:
        "セッションが切れています。お手数ですがリセットメールから再度アクセスしてください。",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[reset-password] updateUser error", error);
    return {
      ok: false,
      message: "パスワードの更新に失敗しました",
    };
  }

  revalidatePath("/", "layout");
  redirect("/watches");
}
