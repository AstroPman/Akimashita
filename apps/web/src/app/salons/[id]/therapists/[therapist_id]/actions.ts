"use server";

import { revalidatePath } from "next/cache";
import { ReviewFormSchema } from "@/lib/schema/review";
import { createClient } from "@/lib/supabase/server";
import type { ReviewActionState } from "./action-state";

function failure(
  message: string,
  error: unknown,
  extra?: Record<string, unknown>,
): ReviewActionState {
  console.error(`[reviews] ${message}`, error, extra);
  if (
    process.env.NODE_ENV !== "production" &&
    error &&
    typeof error === "object"
  ) {
    const e = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const detail = [e.code, e.message, e.details, e.hint]
      .filter(Boolean)
      .join(" / ");
    if (detail) return { ok: false, message: `${message}: ${detail}` };
  }
  return { ok: false, message };
}

/**
 * セラピスト詳細ページの口コミ投稿フォーム (Dialog) からの送信を受ける Server Action。
 *
 * - 認証必須。未ログインなら `ok:false` でエラーメッセージを返す
 * - 同一セラピスト × 同一ユーザの既存「生きている」レビューがあれば 409 相当でブロック
 *   (UI からはそもそも /account/reviews 経由で編集する想定だが、二重投稿を物理的に塞ぐ)
 * - submit_review RPC は status='pending' で挿入する
 * - 投稿後はセラピスト詳細ページと自分の投稿管理ページを `revalidatePath`
 *
 * useActionState 互換のため第 1 引数で前回 state、第 2 引数で FormData を受ける。
 */
export async function submitReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  // new_tag_labels はフォーム側で複数の hidden 要素を吐くため getAll で受ける。
  const raw = {
    therapist_id: formData.get("therapist_id"),
    rating_overall: formData.get("rating_overall"),
    body: formData.get("body"),
    visit_year_month: formData.get("visit_year_month"),
    course_label: formData.get("course_label"),
    course_price_yen: formData.get("course_price_yen"),
    display_name: formData.get("display_name"),
    new_tag_labels: formData.getAll("new_tag_labels"),
  };

  const parsed = ReviewFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  // 同一セラピスト × 自分の生きているレビューがあれば早期リターン。
  // submit_review RPC は部分 unique 制約で必ず 409 になるが、
  // メッセージをユーザに分かる形で返したいので前段で潰す。
  const { data: existing, error: existingError } = await supabase
    .from("reviews")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("therapist_id", parsed.data.therapist_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) {
    return failure("既存レビューの確認に失敗しました", existingError);
  }
  if (existing) {
    return {
      ok: false,
      message:
        "このセラピストへの口コミは既に投稿済みです。マイページから内容を編集できます。",
    };
  }

  const newTagLabels = parsed.data.new_tag_labels ?? [];

  const { data, error } = await supabase
    .rpc("submit_review", {
      p_therapist_id: parsed.data.therapist_id,
      p_rating: parsed.data.rating_overall,
      p_body: parsed.data.body ?? null,
      p_visit_year_month: parsed.data.visit_year_month ?? null,
      p_course_label: parsed.data.course_label ?? null,
      p_course_price_yen: parsed.data.course_price_yen ?? null,
      p_display_name: parsed.data.display_name ?? null,
      p_new_tag_labels: newTagLabels.length > 0 ? newTagLabels : null,
    })
    .maybeSingle();

  if (error || !data) {
    return failure("口コミの投稿に失敗しました", error, {
      user_id: user.id,
      therapist_id: parsed.data.therapist_id,
    });
  }

  const inserted = data as { id: string; status: string };

  // セラピスト詳細ページ (件数・集計が変わる) と自分の投稿管理ページを再検証。
  // 詳細ページ URL は salon_id を知らなくても therapists 経由で広く効く形で打つ。
  revalidatePath("/salons", "layout");
  revalidatePath("/account/reviews");

  return {
    ok: true,
    reviewId: inserted.id,
    therapistId: parsed.data.therapist_id,
    rating: parsed.data.rating_overall,
    hasBody: Boolean(parsed.data.body),
    tagCount: newTagLabels.length,
  };
}
