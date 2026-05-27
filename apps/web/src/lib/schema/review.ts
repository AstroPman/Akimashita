import { z } from "zod";

/**
 * 口コミ投稿フォームの zod スキーマ。
 *
 * - 必須項目は `therapist_id` と `rating_overall` の 2 つだけ。
 *   入力ハードルを下げ、星だけでも投稿できるようにする。
 * - 任意項目は trim 後の空文字列を `undefined` に正規化する。
 *   フォームの hidden/未入力フィールドが空文字で送られてきても
 *   サーバ側で valid 扱いにできるようにするため。
 * - PR1 ではタグ・写真・複数軸評価は対象外。スキーマも今は MVP 範囲。
 */

const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/** 入力時刻の年月。`YYYY-MM` 形式の文字列。 */
const visitYearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "訪問月の形式が正しくありません");

/** 任意のテキスト入力を「trim 後の空文字列を undefined に倒す」共通整形。 */
function optionalTrimmed(max: number, label: string) {
  return z
    .string()
    .max(max, `${label}は ${max} 文字以内で入力してください`)
    .transform((v) => {
      const t = v.trim();
      return t.length === 0 ? undefined : t;
    })
    .optional();
}

export const ReviewFormSchema = z.object({
  therapist_id: z.string().uuid("セラピストの指定が不正です"),
  rating_overall: z.coerce
    .number()
    .int("評価は整数で入力してください")
    .refine(
      (v): v is (typeof RATING_VALUES)[number] =>
        (RATING_VALUES as readonly number[]).includes(v),
      { message: "評価は 1〜5 の星で選んでください" },
    ),
  body: optionalTrimmed(2000, "本文"),
  visit_year_month: z
    .union([visitYearMonthSchema, z.literal("")])
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined)),
  course_label: optionalTrimmed(60, "コース名"),
  course_price_yen: z
    .union([z.coerce.number().int().min(0).max(1_000_000), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  display_name: optionalTrimmed(20, "表示名"),
});

export type ReviewFormInput = z.input<typeof ReviewFormSchema>;
export type ReviewFormValues = z.output<typeof ReviewFormSchema>;

export const defaultReviewFormValues: ReviewFormInput = {
  therapist_id: "",
  rating_overall: 5,
  body: "",
  visit_year_month: "",
  course_label: "",
  course_price_yen: "",
  display_name: "",
};

export const REVIEW_RATING_VALUES = RATING_VALUES;
