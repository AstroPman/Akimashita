import type { ExternalTherapistRecord } from '@alimashita/shared';
import { httpMenesthe } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('menesthe:therapist_list');

const BASE_URL = 'https://men-esthe.jp';
const IMAGE_BASE = 'https://men-esthe.jp/contents/therapist/';

/**
 * men-esthe.jp の per-salon JSON API レスポンス1件分の生スキーマ。
 *
 * 観測している主要フィールドのみ宣言。未知フィールドが増えても無視できるよう
 * unknown 互換で受ける。
 *
 *   id           : number  (セラピストID, therapist.php?id=N)
 *   salon_id     : number  (親サロンID = external_salons.source_id を整数化したもの)
 *   status       : number  (1=在籍 / 2=退店)
 *   name         : string  (例: "メイ (28)")
 *   kana         : string | null
 *   style        : string | null  (例: "T153 G", "T166" 等)
 *   image1..6    : string | null  (画像ハッシュ + 拡張子)
 *   therapist_url: string | null  (公式 HP の cast 詳細 URL)
 *   comment      : string | null  (紹介文)
 *   created_at   : string | null
 *   updated_at   : string | null
 *   deleted_at   : string | null
 */
interface MenestheTherapistRow {
  id?: number | string;
  salon_id?: number | string;
  status?: number;
  name?: string | null;
  kana?: string | null;
  style?: string | null;
  image1?: string | null;
  image2?: string | null;
  image3?: string | null;
  image4?: string | null;
  image5?: string | null;
  image6?: string | null;
  therapist_url?: string | null;
  comment?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

/**
 * サロン1件分のセラピスト一覧をページ単位に取得する。
 *
 * URL: `therapistlist.php?id={salon_id}&more&p={page}` (p は 0-indexed)
 *
 * - 初回呼び出しでサーバが空配列を返したら終了。
 * - 1 ページしか返さないサロン (= 全件 8 件以下) も多数なので、
 *   `MAX_PAGES` で安全弁を設ける。
 * - 同一 source_id が複数回現れる挙動 (シャッフル + ページング) があり得るので
 *   Map で重複排除する。
 */
export async function fetchExternalTherapists(
  menestheSalonId: string,
  options: { maxPages?: number } = {},
): Promise<ExternalTherapistRecord[]> {
  const maxPages = options.maxPages ?? 50;

  const records = new Map<string, ExternalTherapistRecord>();

  for (let page = 0; page < maxPages; page++) {
    const url = `${BASE_URL}/therapistlist.php?id=${encodeURIComponent(menestheSalonId)}&more&p=${page}`;
    log.info('Fetching therapist list page', { salon_id: menestheSalonId, page, url });

    let body: unknown;
    try {
      body = await httpMenesthe.getJson<unknown>(url);
    } catch (err) {
      log.warn('Therapist list fetch failed, stopping pagination', {
        salon_id: menestheSalonId,
        page,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    if (!Array.isArray(body)) {
      log.warn('Therapist list response is not an array, stopping', {
        salon_id: menestheSalonId,
        page,
      });
      break;
    }

    if (body.length === 0) {
      // 空 → これ以上はない。
      break;
    }

    let added = 0;
    for (const raw of body as MenestheTherapistRow[]) {
      const parsed = parseTherapistRow(raw, menestheSalonId);
      if (!parsed) continue;
      if (records.has(parsed.source_id)) continue;
      records.set(parsed.source_id, parsed);
      added += 1;
    }

    // 1 ページ全て重複だった = サーバ側がループしている可能性。これ以上取らない。
    if (added === 0) break;
  }

  const result = [...records.values()];
  log.info('Finished therapist list crawl', {
    salon_id: menestheSalonId,
    count: result.length,
  });
  return result;
}

/**
 * JSON 1 行を ExternalTherapistRecord に正規化する純粋関数。
 *
 * - id / name が無いものはスキップ (null を返す)。
 * - "メイ (28)" → name="メイ", display_name="メイ (28)", age=28 に分解。
 * - "T153 G" → height=153, cup="G" に分解。height だけ ("T166") も許容。
 *   どちらも無い ("ぽっちゃり" 等のフリー記述) ときは raw のみ保持。
 * - image1..6 は contents/therapist/{hash} の絶対 URL に変換して image_urls 配列に詰める。
 *   primary_image_url は image1。
 */
export function parseTherapistRow(
  raw: MenestheTherapistRow,
  salonSourceId: string,
): ExternalTherapistRecord | null {
  const sourceId = stringifyId(raw.id);
  if (!sourceId) return null;
  const displayName = (raw.name ?? '').trim();
  if (!displayName) return null;

  const { name, age } = splitNameAndAge(displayName);
  const { height, cup } = parseStyle(raw.style ?? null);

  const images: string[] = [];
  for (const key of ['image1', 'image2', 'image3', 'image4', 'image5', 'image6'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && v.length > 0) images.push(toAbsoluteImageUrl(v));
  }

  return {
    source_id: sourceId,
    salon_source_id: salonSourceId,
    name,
    display_name: displayName,
    kana: nullable(raw.kana),
    age,
    height,
    cup,
    style_raw: nullable(raw.style),
    image_urls: images,
    primary_image_url: images[0] ?? null,
    therapist_url: nullable(raw.therapist_url),
    comment: nullable(raw.comment),
    status: typeof raw.status === 'number' ? raw.status : 1,
    source_updated_at: nullable(raw.updated_at),
    source_url: `${BASE_URL}/therapist.php?id=${sourceId}`,
  };
}

function stringifyId(v: unknown): string {
  if (typeof v === 'number') return String(Math.trunc(v));
  if (typeof v === 'string') return v.trim();
  return '';
}

function nullable(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * "メイ (28)" / "ALICE (22)" / "ミサト" などを (name, age) に分解する。
 * 末尾の `(\d+)` のみを年齢として認識し、それ以外の括弧は名前の一部として残す。
 */
export function splitNameAndAge(displayName: string): { name: string; age: number | null } {
  const trimmed = displayName.replace(/\s+/g, ' ').trim();
  const m = trimmed.match(/^(.+?)\s*\((\d{1,3})\)\s*$/);
  if (!m) return { name: trimmed, age: null };
  const name = (m[1] ?? '').trim();
  const age = Number.parseInt(m[2] ?? '', 10);
  if (!name) return { name: trimmed, age: null };
  return { name, age: Number.isFinite(age) ? age : null };
}

/**
 * "T153 G" / "T166" / "150 / G" / "ぽっちゃり" 等から (height, cup) を取り出す。
 * - 身長: `T(\d+)` (men-esthe 慣習) または先頭の `\d+` (cm 想定)
 * - カップ: アルファベット 1 文字 (A-Z) を独立トークン or "G カップ" のような形で。
 * 未パースなら null を返す (style_raw 側で原文を保持)。
 */
export function parseStyle(style: string | null): { height: number | null; cup: string | null } {
  if (!style) return { height: null, cup: null };
  let height: number | null = null;
  const heightMatch = style.match(/T\s*(\d{2,3})/i) ?? style.match(/\b(\d{3})\b/);
  if (heightMatch) {
    const n = Number.parseInt(heightMatch[1] ?? '', 10);
    if (Number.isFinite(n) && n >= 130 && n <= 200) height = n;
  }
  let cup: string | null = null;
  // 単独の 1 文字 (A-Z) を「カップ」とみなす。身長の T と被らないよう A-S までに絞る。
  // 例: "T153 G" → "G"、"150 / G" → "G"、"T166" → null
  const cupMatch = style.match(/(?:^|[^A-Za-z])([A-SU-Z])(?=$|[^A-Za-z])/);
  if (cupMatch) cup = (cupMatch[1] ?? '').toUpperCase();
  return { height, cup };
}

function toAbsoluteImageUrl(filename: string): string {
  if (/^https?:\/\//i.test(filename)) return filename;
  return `${IMAGE_BASE}${filename.replace(/^\/+/, '')}`;
}
