"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type DeleteReviewResult =
  | { ok: true }
  | { ok: false; message: string };

const DeleteReviewSchema = z.object({ id: z.string().uuid() });

/**
 * 自分が投稿した口コミを物理削除する。
 *
 * RLS の `reviews_delete_self` で他人の行は触れないため、
 * 認証チェックだけ済ませて DELETE を流す。
 */
export async function deleteMyReview(
  input: { id: string },
): Promise<DeleteReviewResult> {
  const parsed = DeleteReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "不正な ID です" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です" };
  }

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[reviews] deleteMyReview", error);
    return { ok: false, message: "口コミの削除に失敗しました" };
  }

  revalidatePath("/account/reviews");
  // 詳細ページのレビュー一覧と集計が変わるので、salons 配下も再検証。
  revalidatePath("/salons", "layout");
  return { ok: true };
}
