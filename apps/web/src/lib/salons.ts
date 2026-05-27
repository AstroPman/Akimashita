import { createAnonClient } from "@/lib/supabase/anon";
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

/**
 * 公開サロン一覧の全件取得。
 *
 * 通常の公開ページからは呼ばない（`getPublicStats` / `searchPublicSalons` /
 * `getPublicAreas` / `getPublicSalon` に分割済み）。フォールバック用と、
 * 全件 id 列挙を必要としないバッチ処理から呼ばれる残置 API。
 * sitemap.xml は `getPublicSalonsForSitemap` を使うこと（cookies 非依存で
 * ISR キャッシュが効く版）。
 *
 * 1 リクエストあたり全 salons + therapists の GROUP BY 集計が走るため、
 * 1000 件規模で実測 500ms 程度かかる。新規呼び出しは避け、既存の
 * 利用箇所も用途別 RPC への移行を続けること。
 */
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

/**
 * 1 サロンを id で単体取得する。
 *
 * 専用 RPC `get_public_salon(uuid)` を呼ぶ pkey lookup ベース。
 * 旧実装は `get_public_salons()` を全件引いてクライアント側で `find` していたが、
 * salons が 1000 件規模になると 500ms 級の無駄になるので分離した。
 */
export async function getPublicSalon(id: string): Promise<PublicSalon | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_public_salon", { p_id: id })
    .maybeSingle();

  if (error) {
    console.error("getPublicSalon (rpc):", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as PublicSalonRow;
  return {
    id: row.id,
    name: row.name,
    therapistCount: row.therapist_count ?? 0,
    prefecture: row.prefecture ?? null,
    areas: row.areas ?? [],
  };
}

/**
 * 公開ページの集計用。
 *
 * - salonCount: 論理削除されていない salons の総数（ScaleStats / SupportedSalonsTeaser 用）
 * - therapistCount: 論理削除されていない therapists の総数（ScaleStats 用）
 *
 * `get_public_stats()` は数値のみを返す軽量 RPC。失敗時はゼロを返し、
 * 呼び出し側で「ゼロのときはセクション非表示」のフォールバックを利かせる前提。
 */
export interface PublicStats {
  salonCount: number;
  therapistCount: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_stats").maybeSingle();

  if (error) {
    console.error("getPublicStats (rpc):", error.message);
    return { salonCount: 0, therapistCount: 0 };
  }
  if (!data) {
    return { salonCount: 0, therapistCount: 0 };
  }
  const row = data as { salon_count: number | null; therapist_count: number | null };
  return {
    salonCount: row.salon_count ?? 0,
    therapistCount: row.therapist_count ?? 0,
  };
}

/**
 * /salons のエリアセレクタ用。
 *
 * 公開対象 salons に紐付く `(prefecture, area)` のユニーク一覧を都道府県ごとに
 * グルーピングして返す。`PublicSearchForm` の `AreaGroup[]` 型と同じ形。
 */
export interface PublicAreaGroup {
  prefecture: string;
  areas: string[];
}

/**
 * エリアセレクタ上の都道府県（および地方名ラベル）の表示順序。
 *
 * ユーザが探す頻度が高いと思われる順で、SQL の `ORDER BY prefecture`
 * （Unicode コードポイント順）を上書きする。優先順は以下の通り:
 *
 *   1. 東京都 → 神奈川県 → 千葉県 → 埼玉県（首都圏 1 都 3 県）
 *   2. 関西地方（外部ポータルが「関西地方」と一括ラベルで返してくる）
 *   3. それ以外は北から順（地方名ラベルもおおよそ北からの位置で挿入）
 *
 * 外部ポータルの `prefecture` は「東京都」のような行政区分名以外に、
 * 「中部地方」「北信越」「九州」のような地方名ラベルが混入しているため、
 * 実データに現れる値を網羅的に並べている。新しいラベルが増えた場合は
 * 末尾 (`Number.MAX_SAFE_INTEGER`) に落ちるので体感的な順序は崩れない。
 */
const PREFECTURE_DISPLAY_ORDER: readonly string[] = [
  "東京都",
  "神奈川県",
  "千葉県",
  "埼玉県",
  "関西地方",
  "北海道",
  "東北地方",
  "茨城県",
  "栃木県",
  "群馬県",
  "北信越",
  "北陸",
  "中部地方",
  "中国・四国",
  "九州",
  "沖縄",
];

const PREFECTURE_ORDER_MAP: ReadonlyMap<string, number> = new Map(
  PREFECTURE_DISPLAY_ORDER.map((name, index) => [name, index]),
);

function comparePrefectures(a: string, b: string): number {
  const ai = PREFECTURE_ORDER_MAP.get(a) ?? Number.MAX_SAFE_INTEGER;
  const bi = PREFECTURE_ORDER_MAP.get(b) ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  // 順位表に無い (＝末尾フォールバック) 同士は文字列順で安定化する。
  return a.localeCompare(b, "ja");
}

export async function getPublicAreas(): Promise<PublicAreaGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_areas");
  if (error) {
    console.error("getPublicAreas (rpc):", error.message);
    return [];
  }
  const rows = (data ?? []) as { prefecture: string; area: string }[];

  // RPC 側は (prefecture, area) のフラットな順序付きリストを返すので
  // クライアント側で prefecture ごとにバケットする。
  // 各 prefecture 内の area は RPC の area asc 順をそのまま維持する。
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.prefecture || !r.area) continue;
    const list = map.get(r.prefecture);
    if (list) list.push(r.area);
    else map.set(r.prefecture, [r.area]);
  }
  return [...map.entries()]
    .map(([prefecture, areas]) => ({ prefecture, areas }))
    .sort((a, b) => comparePrefectures(a.prefecture, b.prefecture));
}

/**
 * /salons のサロン軸検索結果。
 *
 * `search_public_salons` RPC を呼び、フィルタ済みの公開サロン + ページネーション
 * 用 `totalCount` を返す。一覧画面のページング UI と「N 件中 K 件が該当」表示に
 * 使う。
 */
export interface SearchPublicSalonsParams {
  salon?: string | null;
  area?: string | null;
  limit?: number;
  offset?: number;
}

export interface PublicSalonsSearchResult {
  items: PublicSalon[];
  totalCount: number;
}

interface PublicSalonsSearchRow {
  id: string;
  name: string;
  therapist_count: number | null;
  prefecture: string | null;
  areas: string[] | null;
  total_count: number | string | null;
}

/**
 * サロン軸検索のデフォルト件数。検索画面では現状ページング UI を持たず
 * 「該当全件」を一覧表示しているため、実質全件を返せる上限値とする。
 * 公開対象 salons の総数が 2000 を大幅に超えるようになったら呼び出し
 * 側でページング UI を入れた上で値を見直すこと。
 */
export const PUBLIC_SALON_SEARCH_DEFAULT_LIMIT = 2000;

export async function searchPublicSalons(
  params: SearchPublicSalonsParams,
): Promise<PublicSalonsSearchResult> {
  const supabase = await createClient();
  const limit = Math.max(
    1,
    Math.min(params.limit ?? PUBLIC_SALON_SEARCH_DEFAULT_LIMIT, 2000),
  );
  const offset = Math.max(0, params.offset ?? 0);

  const { data, error } = await supabase.rpc("search_public_salons", {
    p_salon_query: params.salon?.trim() || null,
    p_area: params.area?.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("searchPublicSalons (rpc):", error.message);
    return { items: [], totalCount: 0 };
  }
  const rows = (data ?? []) as PublicSalonsSearchRow[];
  const items: PublicSalon[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    therapistCount: r.therapist_count ?? 0,
    prefecture: r.prefecture ?? null,
    areas: r.areas ?? [],
  }));

  // total_count は全行で同じ値が入っている (window 関数のため)。
  // ヒット 0 件のときは行自体がないので 0 にフォールバック。
  const totalCount =
    rows.length === 0 ? 0 : Number(rows[0].total_count ?? 0);

  return { items, totalCount: Number.isFinite(totalCount) ? totalCount : 0 };
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

// ============================================================================
// sitemap.xml 用ヘルパー
//
// sitemap は `cookies()` を使う `createClient()` を介してしまうと dynamic 化
// されて ISR キャッシュが効かなくなる。下記の sitemap 専用関数は cookies に
// 触らない `createAnonClient()` を使う。
// ============================================================================

/**
 * sitemap.xml の分割数を決めるための公開セラピスト件数取得。
 *
 * `count: "exact", head: true` で行を引かずに件数だけ取得し、Supabase の
 * 行上限を回避する。RLS では therapists の anon select 可だが、退店済み
 * (`deleted_at is not null`) は外す。
 */
export async function countPublicTherapists(): Promise<number> {
  const supabase = createAnonClient();
  const { count, error } = await supabase
    .from("therapists")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (error) {
    console.error("countPublicTherapists:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * sitemap.xml 分割用に、公開対象のセラピストを offset/limit でページ取得する。
 *
 * Supabase の単発 `.range()` には実質 1000 件のリミットがあるため、内部で
 * 1000 件ずつループして `limit` まで埋める。1 サイトマップ 5000 件想定。
 */
export async function listPublicTherapistsForSitemapPage(
  offset: number,
  limit: number,
): Promise<{ id: string; salonId: string; updatedAt: string | null }[]> {
  const supabase = createAnonClient();
  const pageSize = 1000;
  const out: { id: string; salonId: string; updatedAt: string | null }[] = [];

  let cursor = offset;
  const end = offset + limit;

  while (cursor < end) {
    const batchSize = Math.min(pageSize, end - cursor);
    const { data, error } = await supabase
      .from("therapists")
      .select("id, salon_id, updated_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(cursor, cursor + batchSize - 1);

    if (error) {
      console.error("listPublicTherapistsForSitemapPage:", error.message);
      return out;
    }

    type Row = { id: string; salon_id: string; updated_at: string | null };
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      out.push({ id: r.id, salonId: r.salon_id, updatedAt: r.updated_at });
    }
    if (rows.length < batchSize) break;
    cursor += rows.length;
  }
  return out;
}

/**
 * sitemap.xml 用に、公開サロン id を全件列挙する（cookies 不使用）。
 *
 * sitemap で使う情報は id だけなので、`get_public_salons` RPC の戻り値から
 * id のみを抜き出す軽量版。
 */
export async function getPublicSalonsForSitemap(): Promise<{ id: string }[]> {
  const supabase = createAnonClient();
  const pageSize = 1000;
  const out: { id: string }[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc("get_public_salons")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("getPublicSalonsForSitemap (rpc):", error.message);
      return out;
    }

    type Row = { id: string };
    const rows = (data ?? []) as Row[];
    for (const r of rows) out.push({ id: r.id });
    if (rows.length < pageSize) break;
  }
  return out;
}
