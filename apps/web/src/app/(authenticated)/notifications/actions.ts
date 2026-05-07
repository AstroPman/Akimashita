"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

function failure(message: string, error: unknown): ActionResult {
  console.error(`[notifications] ${message}`, error);
  if (process.env.NODE_ENV !== "production" && error && typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(" / ");
    if (detail) return { ok: false, message: `${message}: ${detail}` };
  }
  return { ok: false, message };
}

const IdSchema = z.object({ id: z.string().uuid() });

export async function markEmailRead(input: { id: string }): Promise<ActionResult> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "不正な入力です" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  const { error } = await supabase
    .from("notification_emails")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .is("read_at", null);

  if (error) {
    return failure("既読化に失敗しました", error);
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAnnouncementRead(input: {
  id: string;
}): Promise<ActionResult> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "不正な入力です" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  // 既読化は upsert 相当（既に既読でも 200 でよい）
  const { error } = await supabase
    .from("announcement_reads")
    .upsert(
      {
        announcement_id: parsed.data.id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
    );

  if (error) {
    return failure("既読化に失敗しました", error);
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}
