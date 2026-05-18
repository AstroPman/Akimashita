import { createClient } from "@/lib/supabase/server";

export interface PublicSalon {
  id: string;
  name: string;
  /** 論理削除されていないセラピスト（在籍）人数 */
  therapistCount: number;
  /** 外部ポータルから取得した都道府県名。未リンク or 未取得は null。 */
  prefecture: string | null;
  /** 外部ポータル基準のエリア名 (例: '新橋・銀座')。未取得時は空配列。 */
  areas: string[];
}

interface PublicSalonRow {
  id: string;
  name: string;
  therapist_count: number;
  prefecture: string | null;
  areas: string[] | null;
}

export async function getPublicSalons(): Promise<PublicSalon[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: PublicSalonRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc("get_public_salons")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("getPublicSalons (rpc):", error.message);
      return [];
    }

    const chunk = (data ?? []) as PublicSalonRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    therapistCount: row.therapist_count ?? 0,
    prefecture: row.prefecture ?? null,
    areas: row.areas ?? [],
  }));
}

export async function getPublicSalon(id: string): Promise<PublicSalon | null> {
  // get_public_salons() は全件返す軽量 RPC なので、1 件だけ欲しい場合でもこれを引いて
  // クライアント側でフィルタする。サロン数が増えてきたら専用 RPC に切り出す。
  const all = await getPublicSalons();
  return all.find((s) => s.id === id) ?? null;
}

/**
 * サロン配下のセラピスト一覧 (外部ポータル由来のリッチ情報を join 済み)。
 * RPC 戻り値の snake_case をそのまま camelCase に詰め替えただけの形。
 */
export interface PublicSalonTherapist {
  id: string;
  name: string;
  displayName: string;
  age: number | null;
  height: number | null;
  cup: string | null;
  styleRaw: string | null;
  primaryImageUrl: string | null;
  imageUrls: string[];
  comment: string | null;
  /** 我々の予約システムにおけるセラピストプロフィール URL (実予約への動線)。 */
  profileUrl: string | null;
  /** サロン公式 HP の cast 詳細 URL (外部ポータル由来)。 */
  externalProfileUrl: string | null;
}

interface PublicSalonTherapistRow {
  id: string;
  name: string;
  display_name: string | null;
  age: number | null;
  height: number | null;
  cup: string | null;
  style_raw: string | null;
  primary_image_url: string | null;
  image_urls: string[] | null;
  comment: string | null;
  profile_url: string | null;
  external_profile_url: string | null;
}

export async function getPublicSalonTherapists(
  salonId: string,
): Promise<PublicSalonTherapist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_salon_therapists", {
    p_salon_id: salonId,
  });
  if (error) {
    console.error("getPublicSalonTherapists (rpc):", error.message);
    return [];
  }
  const rows = (data ?? []) as PublicSalonTherapistRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name ?? r.name,
    age: r.age ?? null,
    height: r.height ?? null,
    cup: r.cup ?? null,
    styleRaw: r.style_raw ?? null,
    primaryImageUrl: r.primary_image_url ?? null,
    imageUrls: r.image_urls ?? [],
    comment: r.comment ?? null,
    profileUrl: r.profile_url ?? null,
    externalProfileUrl: r.external_profile_url ?? null,
  }));
}

/**
 * 公開セラピスト詳細を取得する単発ヘルパー。
 * `getPublicSalonTherapists` の結果から該当 ID を抽出する形にしているので、
 * 同じサロンの他セラピストカードを「同じ店舗の他のセラピスト」として
 * 並べたい場面では呼び出し側で再利用できる。
 */
export async function getPublicSalonTherapist(
  salonId: string,
  therapistId: string,
): Promise<PublicSalonTherapist | null> {
  const list = await getPublicSalonTherapists(salonId);
  return list.find((t) => t.id === therapistId) ?? null;
}

/**
 * サロン横断のセラピスト検索結果。`get_public_therapists` RPC の返り値を
 * camelCase に詰め替えたもの。一覧カード描画と所属サロンへのリンクに必要な
 * 情報をひと纏めにしている。
 */
export interface PublicTherapistSearchHit {
  id: string;
  name: string;
  displayName: string;
  age: number | null;
  height: number | null;
  cup: string | null;
  styleRaw: string | null;
  primaryImageUrl: string | null;
  comment: string | null;
  salonId: string;
  salonName: string;
  prefecture: string | null;
  areas: string[];
}

export interface PublicTherapistSearchResult {
  items: PublicTherapistSearchHit[];
  /** ページネーション計算用の全件数 (RPC が window 関数で同時取得した値)。 */
  totalCount: number;
}

export interface SearchPublicTherapistsParams {
  salon?: string | null;
  therapist?: string | null;
  area?: string | null;
  limit?: number;
  offset?: number;
}

interface PublicTherapistSearchRow {
  id: string;
  name: string;
  display_name: string | null;
  age: number | null;
  height: number | null;
  cup: string | null;
  style_raw: string | null;
  primary_image_url: string | null;
  comment: string | null;
  salon_id: string;
  salon_name: string;
  prefecture: string | null;
  areas: string[] | null;
  total_count: number | string | null;
}

export const PUBLIC_THERAPIST_SEARCH_DEFAULT_LIMIT = 60;

export async function searchPublicTherapists(
  params: SearchPublicTherapistsParams,
): Promise<PublicTherapistSearchResult> {
  const supabase = await createClient();
  const limit = Math.max(
    1,
    Math.min(params.limit ?? PUBLIC_THERAPIST_SEARCH_DEFAULT_LIMIT, 200),
  );
  const offset = Math.max(0, params.offset ?? 0);

  const { data, error } = await supabase.rpc("get_public_therapists", {
    p_salon_query: params.salon?.trim() || null,
    p_therapist_query: params.therapist?.trim() || null,
    p_area: params.area?.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("searchPublicTherapists (rpc):", error.message);
    return { items: [], totalCount: 0 };
  }

  const rows = (data ?? []) as PublicTherapistSearchRow[];
  const items: PublicTherapistSearchHit[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name ?? r.name,
    age: r.age ?? null,
    height: r.height ?? null,
    cup: r.cup ?? null,
    styleRaw: r.style_raw ?? null,
    primaryImageUrl: r.primary_image_url ?? null,
    comment: r.comment ?? null,
    salonId: r.salon_id,
    salonName: r.salon_name,
    prefecture: r.prefecture ?? null,
    areas: r.areas ?? [],
  }));

  // total_count は全行で同じ値が入っている (window 関数のため)。
  // ヒット 0 件のときは行自体がないので 0 にフォールバック。
  const totalCount =
    rows.length === 0
      ? 0
      : Number(rows[0].total_count ?? 0);

  return { items, totalCount: Number.isFinite(totalCount) ? totalCount : 0 };
}

/**
 * 公開セラピスト詳細用の集計結果。
 * `get_therapist_stats` RPC の JSON をそのまま使う型 (camelCase 変換しない)
 * ことで、既存の `[TherapistStatsBlock](apps/web/src/app/(authenticated)/watches/_components/therapist-stats.tsx)`
 * にそのまま渡せるようにしている。
 */
export type PublicTherapistStats = {
  next_shift_date: string | null;
  recent_shift_days: number;
  recent_opening_count: number;
  median_kill_seconds: number | null;
  dow_hour_heatmap: { dow: number; hour: number; count: number }[];
  watcher_count: number;
  window_days: number;
  next_available_slot: { date: string; start_time: string } | null;
};

export async function getPublicTherapistStats(
  therapistId: string,
  windowDays = 30,
): Promise<PublicTherapistStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_therapist_stats", {
    p_therapist_id: therapistId,
    p_window_days: windowDays,
  });
  if (error) {
    console.error("getPublicTherapistStats (rpc):", error.message);
    return null;
  }
  return (data as PublicTherapistStats | null) ?? null;
}

/**
 * sitemap.xml 用に、公開対象のセラピスト全件 (id, salon_id, updated_at) を列挙する。
 *
 * Supabase の RLS では `therapists` 自体は anon select 可だが、退店済み
 * (`deleted_at is not null`) を除外するため `.is(...)` で明示的にフィルタする。
 * 件数は数万を想定 (現状 ~37k)。Supabase の row 上限を回避するためページング。
 */
export async function listPublicTherapistsForSitemap(): Promise<
  { id: string; salonId: string; updatedAt: string | null }[]
> {
  const supabase = await createClient();
  const pageSize = 1000;
  const out: { id: string; salonId: string; updatedAt: string | null }[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("therapists")
      .select("id, salon_id, updated_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("listPublicTherapistsForSitemap:", error.message);
      return out;
    }

    type Row = { id: string; salon_id: string; updated_at: string | null };
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      out.push({ id: r.id, salonId: r.salon_id, updatedAt: r.updated_at });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}
