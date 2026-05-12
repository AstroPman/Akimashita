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
