"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LoginSchema } from "@/lib/schema/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password", string[]>>;
};

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
