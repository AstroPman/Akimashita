import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 口コミ機能の Supabase RPC ラッパ。
 *
 * - 公開閲覧系 (`getReviewsForTherapist` / `getReviewAggregate`) は anon でも触れる
 *   RPC を `createClient()` で呼ぶ。
 * - 「自分の投稿管理」 (`getMyReviews`) は user_id = auth.uid() で絞った直接 SELECT。
 *   pending / rejected も含めて表示するため、RLS の `reviews_select_public_or_own` の
 *   後者 (user_id = auth.uid()) のパスに乗る。
 */

export type ReviewTagKind = "safe" | "sensitive";

export interface ReviewTag {
  id: string;
  slug: string;
  label: string;
  kind: ReviewTagKind;
}

export interface PublicReview {
  id: string;
  ratingOverall: number;
  body: string | null;
  visitYearMonth: string | null;
  courseLabel: string | null;
  coursePriceYen: number | null;
  displayName: string | null;
  visibility: "public" | "paid_only";
  helpfulCount: number;
  createdAt: string;
  /**
   * 承認済みタグ (approved=true) のみ含む。
   * 未承認タグは RPC 側でフィルタされるため、ここには現れない。
   */
  tags: ReviewTag[];
}

export interface PublicReviewsPage {
  items: PublicReview[];
  totalCount: number;
}

interface ReviewTagRow {
  id: string;
  slug: string;
  label: string;
  kind: ReviewTagKind;
}

interface PublicReviewRow {
  id: string;
  rating_overall: number;
  body: string | null;
  visit_year_month: string | null;
  course_label: string | null;
  course_price_yen: number | null;
  display_name: string | null;
  visibility: "public" | "paid_only";
  helpful_count: number;
  created_at: string;
  tags: ReviewTagRow[] | null;
  total_count: number | string | null;
}

function mapTagRow(row: ReviewTagRow): ReviewTag {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    kind: row.kind,
  };
}

/**
 * セラピスト詳細ページ向け公開レビュー一覧。
 * `includeSensitive` は paid ユーザかどうかを呼び出し側で判定して渡す。
 * false の場合は paid_only な行が DB レイヤから除外されるため、未課金 SSR HTML に
 * 本文・タグ label が含まれない。
 */
export async function getReviewsForTherapist(
  therapistId: string,
  options: { includeSensitive?: boolean; limit?: number; offset?: number } = {},
): Promise<PublicReviewsPage> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const offset = Math.max(0, options.offset ?? 0);

  const { data, error } = await supabase.rpc(
    "get_published_reviews_for_therapist",
    {
      p_therapist_id: therapistId,
      p_limit: limit,
      p_offset: offset,
      p_include_sensitive: options.includeSensitive ?? false,
    },
  );

  if (error) {
    console.error("getReviewsForTherapist (rpc):", error.message);
    return { items: [], totalCount: 0 };
  }

  const rows = (data ?? []) as PublicReviewRow[];
  const items: PublicReview[] = rows.map((r) => ({
    id: r.id,
    ratingOverall: r.rating_overall,
    body: r.body,
    visitYearMonth: r.visit_year_month,
    courseLabel: r.course_label,
    coursePriceYen: r.course_price_yen,
    displayName: r.display_name,
    visibility: r.visibility,
    helpfulCount: r.helpful_count,
    createdAt: r.created_at,
    tags: Array.isArray(r.tags) ? r.tags.map(mapTagRow) : [],
  }));

  const totalCount = rows.length === 0 ? 0 : Number(rows[0].total_count ?? 0);
  return {
    items,
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
  };
}


export interface ReviewAggregate {
  reviewCount: number;
  averageRating: number | null;
  /** sensitive タグ付与 (visibility='paid_only') のレビュー件数。paywall CTA 用。 */
  paidOnlyCount: number;
}

/**
 * AggregateRating JSON-LD 用の集計値。
 *
 * - `reviewCount` / `averageRating` は visibility='public' のみ集計
 *   (sensitive な評価を Google に流さない設計)。
 * - `paidOnlyCount` は visibility='paid_only' の件数。未課金ユーザに
 *   「有料で N 件の口コミを見る」CTA を出すために使う。
 */
export async function getReviewAggregate(
  therapistId: string,
): Promise<ReviewAggregate> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_therapist_review_aggregate", { p_therapist_id: therapistId })
    .maybeSingle();

  if (error) {
    console.error("getReviewAggregate (rpc):", error.message);
    return { reviewCount: 0, averageRating: null, paidOnlyCount: 0 };
  }
  if (!data) return { reviewCount: 0, averageRating: null, paidOnlyCount: 0 };

  const row = data as {
    review_count: number | null;
    average_rating: number | string | null;
    paid_only_count: number | null;
  };
  const avg = row.average_rating == null ? null : Number(row.average_rating);
  return {
    reviewCount: row.review_count ?? 0,
    averageRating: avg !== null && Number.isFinite(avg) ? avg : null,
    paidOnlyCount: row.paid_only_count ?? 0,
  };
}


export interface ReviewTagSummaryItem extends ReviewTag {
  count: number;
}

/**
 * セラピストごとのタグ別件数 (chip サマリ用)。
 *
 * - 承認済みタグ (approved=true) のみが対象。未承認のユーザ作成タグは
 *   ここには現れない (運営承認まで chip サマリに露出しない)。
 * - `includeSensitive` は呼び出し側で paid 判定して渡す。false の場合は
 *   `visibility='public'` の review のみが集計母集団になるため、
 *   sensitive な集計値が未課金 SSR HTML に漏れない。
 */
export async function getReviewTagSummaryForTherapist(
  therapistId: string,
  options: { includeSensitive?: boolean } = {},
): Promise<ReviewTagSummaryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_therapist_tag_counts", {
    p_therapist_id: therapistId,
    p_include_sensitive: options.includeSensitive ?? false,
  });

  if (error) {
    console.error("getReviewTagSummaryForTherapist:", error.message);
    return [];
  }

  type Row = ReviewTagRow & { count: number | string };
  return ((data ?? []) as Row[]).map((r) => ({
    ...mapTagRow(r),
    count: Number(r.count) || 0,
  }));
}


/**
 * 自分が投稿したレビュー一覧 (status 区別なく全件)。
 * /(authenticated)/account/reviews 用。
 *
 * therapists / salons 情報を JOIN したいが、Supabase の implicit FK 解決を
 * 使うと型推論が崩れるので、admin client で別取得して JS 側でマージする。
 * ユーザの自分の行に絞るため admin でも安全。
 */
export interface MyReview {
  id: string;
  therapistId: string;
  therapistName: string;
  salonId: string | null;
  salonName: string | null;
  ratingOverall: number;
  body: string | null;
  visitYearMonth: string | null;
  courseLabel: string | null;
  coursePriceYen: number | null;
  status: "pending" | "published" | "rejected" | "hidden";
  visibility: "public" | "paid_only";
  rejectedReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function getMyReviews(userId: string): Promise<MyReview[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reviews")
    .select(
      "id, therapist_id, rating_overall, body, visit_year_month, course_label, course_price_yen, status, visibility, rejected_reason, reviewed_at, created_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getMyReviews:", error.message);
    return [];
  }

  type ReviewRow = {
    id: string;
    therapist_id: string;
    rating_overall: number;
    body: string | null;
    visit_year_month: string | null;
    course_label: string | null;
    course_price_yen: number | null;
    status: "pending" | "published" | "rejected" | "hidden";
    visibility: "public" | "paid_only";
    rejected_reason: string | null;
    reviewed_at: string | null;
    created_at: string;
  };

  const rows = (data ?? []) as ReviewRow[];
  if (rows.length === 0) return [];

  const therapistIds = Array.from(new Set(rows.map((r) => r.therapist_id)));
  const { data: therapistRows, error: therapistError } = await admin
    .from("therapists")
    .select("id, name, salon_id")
    .in("id", therapistIds);
  if (therapistError) {
    console.error("getMyReviews therapists:", therapistError.message);
  }
  type TherapistRow = { id: string; name: string; salon_id: string };
  const therapistMap = new Map<string, TherapistRow>();
  for (const t of (therapistRows ?? []) as TherapistRow[]) {
    therapistMap.set(t.id, t);
  }

  const salonIds = Array.from(
    new Set(
      ((therapistRows ?? []) as TherapistRow[])
        .map((t) => t.salon_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const salonMap = new Map<string, string>();
  if (salonIds.length > 0) {
    const { data: salonRows, error: salonError } = await admin
      .from("salons")
      .select("id, name")
      .in("id", salonIds);
    if (salonError) {
      console.error("getMyReviews salons:", salonError.message);
    }
    for (const s of (salonRows ?? []) as { id: string; name: string }[]) {
      salonMap.set(s.id, s.name);
    }
  }

  return rows.map((r) => {
    const therapist = therapistMap.get(r.therapist_id);
    const salonId = therapist?.salon_id ?? null;
    return {
      id: r.id,
      therapistId: r.therapist_id,
      therapistName: therapist?.name ?? "(セラピスト不明)",
      salonId,
      salonName: salonId ? (salonMap.get(salonId) ?? null) : null,
      ratingOverall: r.rating_overall,
      body: r.body,
      visitYearMonth: r.visit_year_month,
      courseLabel: r.course_label,
      coursePriceYen: r.course_price_yen,
      status: r.status,
      visibility: r.visibility,
      rejectedReason: r.rejected_reason,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    };
  });
}
