export type SiteName = 'caskan' | 'grow' | 'edc' | 'estama';

export interface Site {
  id: string;
  name: SiteName;
  base_url: string;
}

export interface Salon {
  id: string;
  site_id: string;
  site_name: SiteName;
  shop_id: string;
  name: string;
  url: string | null;
}

export interface TherapistRecord {
  therapist_id: string;
  name: string;
  profile_url?: string | null;
  image_url?: string | null;
  description?: string | null;
  age?: number | null;
  height?: number | null;
  bust?: number | null;
  waist?: number | null;
  hip?: number | null;
  cup?: string | null;
}

export interface Therapist {
  id: string;
  salon_id: string;
  salon_shop_id: string;
  site_name: SiteName;
  therapist_id: string;
  name: string;
}

export interface AvailabilityRecord {
  date: string;
  start_time: string;
  is_available: boolean;
}

export interface SalonScraper {
  run(): Promise<Salon[]>;
}

export interface TherapistScraper {
  run(salon: Salon): Promise<TherapistRecord[]>;
}

export interface AvailabilityScraper {
  run(therapist: Therapist): Promise<AvailabilityRecord[]>;
}

/**
 * 公式サロンサイト個別ページから抽出した「シフト時間範囲」1 行分。
 * Layer 2 (シフト範囲の存在) の authoritative source として
 * `external_therapist_shifts` に upsert される。
 *
 * - date / shift_start / shift_end は JST 解釈の値。
 * - 跨ぎ深夜 (22:00〜翌04:00 など) はパーサ側で 2 行に分割し、
 *   end <= start にならないよう保つ。
 */
export interface OfficialShiftRecord {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm:ss */
  shift_start: string;
  /** HH:mm:ss（必ず shift_start より後） */
  shift_end: string;
}

/**
 * 公式サイトからシフト範囲を取得するスクレイパ共通インターフェース。
 * 入力は `external_therapists.therapist_url`（セラピスト個別ページ URL）。
 */
export interface OfficialShiftScraper {
  run(therapistUrl: string): Promise<OfficialShiftRecord[]>;
}

/**
 * 通知タイプ。
 * - `slot_opened`: 予約サイト上で空きスロットが新規発生／復活したときの通知（Layer 1）。
 * - `shift_announced`: 公式サイト上で新シフト範囲が公開され、まだ
 *   `availability` に行が無いときの通知（Layer 2）。
 */
export type NotificationKind = 'slot_opened' | 'shift_announced';


// ============================================================
// 外部ポータル(men-esthe.jp 等) 由来の参照データ
// 我々の salons とは独立した reference DB として育てる。
// ============================================================

/** 外部ポータルでのエリア (例: men-esthe.jp の area.php?id=18 = 新橋・銀座)。 */
export interface ExternalAreaRecord {
  source_id: string;
  name: string;
  district: string | null;
  prefecture: string | null;
  source_url: string | null;
}

/** 外部ポータルでのサロン1件分の詳細。 */
export interface ExternalSalonRecord {
  source_id: string;
  name: string;
  prefecture: string | null;
  /** エリア表示名 (例: '新橋・銀座')。複数持ちうる。 */
  areas: string[];
  /** エリアの external source_id 配列 (例: ['18'])。 */
  area_source_ids: string[];
  nearest_stations: string[];
  genre: string | null;
  price_range: string | null;
  opening_hours: string | null;
  homepage_url: string | null;
  source_url: string;
}

/** エリア一覧ページで見つかったサロンの最小情報 (詳細取得前の shell)。 */
export interface ExternalSalonListEntry {
  source_id: string;
  name: string;
  source_url: string;
}

/** ポータルが取り扱う既知サイト名。我々の SiteName と整合させる。 */
export type BookingSiteName = SiteName;

/** 公式サイトから検出した予約システムへの参照。 */
export interface ExternalSalonBooking {
  site_name: BookingSiteName;
  shop_id: string;
  booking_url: string;
}

/**
 * 外部ポータルでのセラピスト1件分の情報。
 *
 * - source_id: ポータル側のセラピストID (例: men-esthe.jp の therapist.php?id=N の N)
 * - salon_source_id: 親サロンの外部 source_id (= external_salons.source_id)
 * - status: ポータル側の値 (1=在籍 / 2=退店)
 * - image_urls: 全画像 (image1-6) の絶対 URL 配列。primary_image_url は image1 相当。
 * - therapist_url: サロン公式 HP 上の cast 詳細ページ URL。
 *   多くは予約システム URL ではないが、稀に直接 r.caskan.jp 等を指している場合があり
 *   後段の link RPC の "A+ パス" で deterministic 紐付けに使う。
 */
export interface ExternalTherapistRecord {
  source_id: string;
  salon_source_id: string;
  name: string;
  display_name: string;
  kana: string | null;
  age: number | null;
  height: number | null;
  cup: string | null;
  style_raw: string | null;
  image_urls: string[];
  primary_image_url: string | null;
  therapist_url: string | null;
  comment: string | null;
  status: number;
  source_updated_at: string | null;
  source_url: string;
}
