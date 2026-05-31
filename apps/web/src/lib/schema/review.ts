import { z } from "zod";

/**
 * 口コミ投稿フォームの zod スキーマ。
 *
 * - 必須項目は `therapist_id` と `rating_overall` の 2 つだけ。
 *   入力ハードルを下げ、星だけでも投稿できるようにする。
 * - 任意項目は trim 後の空文字列を `undefined` に正規化する。
 *   フォームの hidden/未入力フィールドが空文字で送られてきても
 *   サーバ側で valid 扱いにできるようにするため。
 * - PR2 でユーザ作成タグを追加。`new_tag_labels` のみ受け付け、
 *   公式タグは持たない。すべてのユーザ作成タグはサーバ側で
 *   `kind='sensitive', approved=false` 固定で作成される。
 */

const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/** 1 投稿あたりの新規タグ上限。`submit_review` RPC 側 (5) と必ず同じ値にする。 */
export const REVIEW_NEW_TAG_MAX_COUNT = 5;
export const REVIEW_NEW_TAG_MAX_LENGTH = 20;

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

/**
 * `new_tag_labels` は `FormData.getAll()` 経由で受けるため string[] になる。
 * 1 件のみのケースで文字列がそのまま来た場合や、null/undefined もハンドルする。
 * trim 後の空文字は配列から除外する。
 */
const newTagLabelsField = z.preprocess(
  (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    if (typeof v === "string") return v.trim() === "" ? [] : [v];
    return [];
  },
  z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(
          REVIEW_NEW_TAG_MAX_LENGTH,
          `タグは ${REVIEW_NEW_TAG_MAX_LENGTH} 文字以内で入力してください`,
        ),
    )
    .max(
      REVIEW_NEW_TAG_MAX_COUNT,
      `タグは ${REVIEW_NEW_TAG_MAX_COUNT} 個までです`,
    )
    .optional(),
);

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
  new_tag_labels: newTagLabelsField,
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
  new_tag_labels: [],
};

export const REVIEW_RATING_VALUES = RATING_VALUES;
