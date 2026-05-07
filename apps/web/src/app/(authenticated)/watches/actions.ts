"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WatchFormSchema, type WatchFormInput } from "@/lib/schema/watch";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/seats";
import { MAX_WATCH_SETTINGS_PER_USER } from "@/lib/watches/limits";

async function requireActiveSubscription(userId: string) {
  const active = await isSubscriptionActive(userId);
  if (!active) {
    redirect("/pricing?reason=subscription_required");
  }
}

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
      /** duplicate: 同一セラピストの監視が既にある / limit_reached: 監視設定の上限に到達 */
      code?: "duplicate" | "limit_reached";
    };

// 開発時は Supabase のエラー詳細をクライアントにも返してデバッグしやすくする。
// 本番では一般的なメッセージのみを返す。
function failure(
  message: string,
  error: unknown,
  extra?: Record<string, unknown>,
): ActionResult {
  console.error(`[watches] ${message}`, error, extra);
  if (process.env.NODE_ENV !== "production" && error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(" / ");
    if (detail) return { ok: false, message: `${message}: ${detail}` };
  }
  return { ok: false, message };
}

const ToggleSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function toggleActive(input: {
  id: string;
  is_active: boolean;
}): Promise<ActionResult> {
  const parsed = ToggleSchema.safeParse(input);
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
  await requireActiveSubscription(user.id);

  // OFF→ON の遷移なら baseline_at を「いま」に更新し、
  // 停止期間中に積み上がった状態変化が再開直後に通知されないようにする。
  const { data: current, error: fetchError } = await supabase
    .from("watch_settings")
    .select("is_active")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchError || !current) {
    return failure("更新に失敗しました", fetchError);
  }

  const turningOn =
    current.is_active === false && parsed.data.is_active === true;

  const { error } = await supabase
    .from("watch_settings")
    .update({
      is_active: parsed.data.is_active,
      ...(turningOn ? { baseline_at: new Date().toISOString() } : {}),
    })
    .eq("id", parsed.data.id);

  if (error) {
    return failure("更新に失敗しました", error);
  }

  revalidatePath("/watches");
  return { ok: true };
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function deleteWatch(input: { id: string }): Promise<ActionResult> {
  const parsed = DeleteSchema.safeParse(input);
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
  await requireActiveSubscription(user.id);

  const { error } = await supabase
    .from("watch_settings")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    return failure("削除に失敗しました", error);
  }

  revalidatePath("/watches");
  return { ok: true };
}

function normalizeSchedules(input: WatchFormInput["schedules"]) {
  return input.map((s) => ({
    target_date: s.target_date && s.target_date !== "" ? s.target_date : null,
    time_from: s.time_from && s.time_from !== "" ? s.time_from : null,
    time_to: s.time_to && s.time_to !== "" ? s.time_to : null,
  }));
}

export async function createWatch(input: WatchFormInput): Promise<ActionResult> {
  const parsed = WatchFormSchema.safeParse(input);
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
  await requireActiveSubscription(user.id);

  const { count: existingCount, error: countError } = await supabase
    .from("watch_settings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (countError) {
    return failure("監視設定数の確認に失敗しました", countError);
  }
  if ((existingCount ?? 0) >= MAX_WATCH_SETTINGS_PER_USER) {
    return {
      ok: false,
      message: `監視設定は最大 ${MAX_WATCH_SETTINGS_PER_USER} 件までです。不要な設定を削除してから登録してください。`,
      code: "limit_reached",
    };
  }

  const { data: existingForTherapist } = await supabase
    .from("watch_settings")
    .select("id")
    .eq("user_id", user.id)
    .eq("therapist_id", parsed.data.therapist_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existingForTherapist) {
    return {
      ok: false,
      message: "このセラピストの監視設定は既に登録されています",
      code: "duplicate",
    };
  }

  const { data: inserted, error } = await supabase
    .from("watch_settings")
    .insert({
      user_id: user.id,
      therapist_id: parsed.data.therapist_id,
      is_active: parsed.data.is_active,
      notify_line: parsed.data.notify_line,
      notify_email: parsed.data.notify_email,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return failure("監視設定の作成に失敗しました", error, {
      user_id: user.id,
      therapist_id: parsed.data.therapist_id,
    });
  }

  const schedules = normalizeSchedules(parsed.data.schedules);
  if (schedules.length > 0) {
    const { error: scheduleError } = await supabase
      .from("watch_schedules")
      .insert(
        schedules.map((s) => ({
          watch_setting_id: inserted.id,
          ...s,
        })),
      );
    if (scheduleError) {
      return failure("希望日時の登録に失敗しました", scheduleError);
    }
  }

  revalidatePath("/watches");
  redirect("/watches");
}

export async function updateWatch(
  id: string,
  input: WatchFormInput,
): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, message: "不正なIDです" };
  }
  const parsed = WatchFormSchema.safeParse(input);
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
  await requireActiveSubscription(user.id);

  const { data: duplicateOther } = await supabase
    .from("watch_settings")
    .select("id")
    .eq("user_id", user.id)
    .eq("therapist_id", parsed.data.therapist_id)
    .neq("id", id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (duplicateOther) {
    return {
      ok: false,
      message: "このセラピストの監視設定は既に登録されています",
      code: "duplicate",
    };
  }

  // 監視を OFF→ON に切り替えた場合、または対象セラピストを差し替えた場合は
  // baseline_at を「いま」に更新する。これらの操作は実質的に監視を「いま始め直す」
  // 意味合いを持つため、過去の状態変化が再開直後に通知されないようにリセットする。
  const { data: current, error: currentError } = await supabase
    .from("watch_settings")
    .select("is_active, therapist_id")
    .eq("id", id)
    .maybeSingle();
  if (currentError || !current) {
    return failure("監視設定の更新に失敗しました", currentError);
  }

  const refreshBaseline =
    parsed.data.is_active === true &&
    (current.is_active === false ||
      current.therapist_id !== parsed.data.therapist_id);

  const { error: updateError } = await supabase
    .from("watch_settings")
    .update({
      therapist_id: parsed.data.therapist_id,
      is_active: parsed.data.is_active,
      notify_line: parsed.data.notify_line,
      notify_email: parsed.data.notify_email,
      ...(refreshBaseline ? { baseline_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (updateError) {
    return failure("監視設定の更新に失敗しました", updateError);
  }

  const { error: deleteError } = await supabase
    .from("watch_schedules")
    .delete()
    .eq("watch_setting_id", id);
  if (deleteError) {
    return failure("希望日時の更新に失敗しました", deleteError);
  }

  const schedules = normalizeSchedules(parsed.data.schedules);
  if (schedules.length > 0) {
    const { error: insertError } = await supabase
      .from("watch_schedules")
      .insert(
        schedules.map((s) => ({
          watch_setting_id: id,
          ...s,
        })),
      );
    if (insertError) {
      return failure("希望日時の更新に失敗しました", insertError);
    }
  }

  revalidatePath("/watches");
  revalidatePath(`/watches/${id}/edit`);
  redirect("/watches");
}
