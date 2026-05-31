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

export async function markAllRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  const now = new Date().toISOString();

  // 未読のメール通知を一括既読化（RLS で自分の行のみ対象）
  const { error: emailError } = await supabase
    .from("notification_emails")
    .update({ read_at: now })
    .is("read_at", null);

  if (emailError) {
    return failure("既読化に失敗しました", emailError);
  }

  // お知らせは既読レコードを upsert する。全件取得し、未読分を作成する
  const { data: announcements, error: announcementError } = await supabase
    .from("announcements")
    .select("id")
    .returns<{ id: string }[]>();

  if (announcementError) {
    return failure("既読化に失敗しました", announcementError);
  }

  if (announcements && announcements.length > 0) {
    const { error: readError } = await supabase
      .from("announcement_reads")
      .upsert(
        announcements.map((row) => ({
          announcement_id: row.id,
          user_id: user.id,
          read_at: now,
        })),
        { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
      );

    if (readError) {
      return failure("既読化に失敗しました", readError);
    }
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}
