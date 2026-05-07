"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { WaitlistSchema } from "@/lib/schema/waitlist";

export type WaitlistState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"email", string[]>>;
  registered?: boolean;
};

export async function joinWaitlistAction(
  _prev: WaitlistState | undefined,
  formData: FormData,
): Promise<WaitlistState> {
  const parsed = WaitlistSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // service role で書き込み（waitlist は anon insert を許容しているが、
  // 将来 RLS を厳しくしても動くよう admin で書く）
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("waitlist")
    .upsert(
      { email: parsed.data.email },
      { onConflict: "email", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[waitlist] upsert 失敗", error);
    return { ok: false, message: "登録に失敗しました。しばらくしてからお試しください。" };
  }

  return { ok: true, registered: true };
}
