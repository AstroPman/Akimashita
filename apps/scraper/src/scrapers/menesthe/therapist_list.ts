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
 * - 初回呼び出しでサーバが空配列を返したら終了 (= 在籍 0 の正当な結果)。
 * - HTTP / JSON パース失敗、または配列以外のレスポンスは **例外を throw** する。
 *   呼び出し側が空配列と失敗を混同して既存行を soft-delete しないための契約。
 * - ページ途中の失敗も throw（部分結果を返さない）。不完全一覧での誤削除を防ぐ。
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
      log.warn('Therapist list fetch failed', {
        salon_id: menestheSalonId,
        page,
        error: err instanceof Error ? err.message : String(err),
      });
      // 呼び出し側で replace をスキップするため、空配列には落とさず再 throw する。
      throw err;
    }

    if (!Array.isArray(body)) {
      throw new Error(
        `Therapist list response is not an array (salon_id=${menestheSalonId}, page=${page})`,
      );
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
  const { height, bust, waist, hip, cup } = parseStyle(raw.style ?? null);

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
    bust,
    waist,
    hip,
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

interface ParsedStyle {
  height: number | null;
  bust: number | null;
  waist: number | null;
  hip: number | null;
  cup: string | null;
}

/** 全角英数字を半角へ正規化し、後段の正規表現を単純化する。 */
function toHalfWidth(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * "T153 G" / "T166" / "150 / G" / "T160/B85(E)/W56/H85" / "155cm B:87 W:56 H:86" /
 * "ぽっちゃり" 等から (height, bust, waist, hip, cup) を取り出す。
 *
 * - 身長: `T(\d+)` (men-esthe 慣習) または先頭の `\d+` (cm 想定)。
 * - 3 サイズ: `B/W/H` ラベル + 数値。区切り (`/` `:` `.` 空白 全角) のばらつきは
 *   ラベル単位の独立抽出で吸収する。各値は妥当な範囲外なら捨てる。
 * - カップ:
 *   1. `B85(E)` / `B(D)` のようにバスト直後の括弧内を最優先。
 *   2. 無ければ、採寸ラベル (`B85` `W55` `H85` 等の数値) を含む文字列では
 *      カップ無しとみなす (null)。`B` をカップと誤認しないため。
 *   3. それ以外 ("T153 G" 等) は単独英字 (A-N) を拾う。
 *   旧実装は (1)(2)(3) を区別できず、フル 3 サイズ表記で bust の "B" を
 *   カップとして誤抽出していた (cup='B') ため、ここで構造的に切り分ける。
 *   ※ Postgres の backfill と挙動を一致させるため、正規表現の先読みは使わない。
 * 未パースな項目は null を返す (style_raw 側で原文を保持)。
 */
export function parseStyle(style: string | null): ParsedStyle {
  const out: ParsedStyle = { height: null, bust: null, waist: null, hip: null, cup: null };
  if (!style) return out;
  const s = toHalfWidth(style);

  const pickCm = (label: string, min: number, max: number): number | null => {
    const m = s.match(new RegExp(`${label}[.:：．]?\\s*(\\d{2,3})`));
    if (!m) return null;
    const n = Number.parseInt(m[1] ?? '', 10);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  };

  out.height =
    pickCm('T', 130, 200) ??
    (() => {
      const m = s.match(/\b(\d{3})\b/);
      if (!m) return null;
      const n = Number.parseInt(m[1] ?? '', 10);
      return Number.isFinite(n) && n >= 130 && n <= 200 ? n : null;
    })();
  out.bust = pickCm('B', 60, 130);
  out.waist = pickCm('W', 40, 90);
  out.hip = pickCm('H', 60, 130);

  // (1) "Dカップ" のような明示カップ表記を最優先 ("(Dカップ)" / "カップ数： Dカップ" も含む)。
  //     "160cm" の小文字 m を拾わないよう、カップ字は大文字 (T除く) に限定する。
  const kanaCup = s.match(/([A-SU-Z])\s*カップ/);
  // (2) バスト直後の括弧内カップ ("B85(E)" / "B(D)" / "B:85cm(D)")。
  const parenCup = s.match(/B[.:：．]?\s*\d{0,3}\s*(?:cm|㎝)?\s*[(（]\s*([A-Za-z])\s*[)）]/);
  if (kanaCup) {
    out.cup = (kanaCup[1] ?? '').toUpperCase();
  } else if (parenCup) {
    out.cup = (parenCup[1] ?? '').toUpperCase();
  } else if (/[BWH][.:：．]?\d{2,3}/.test(s)) {
    // (3) 採寸ラベル (B/W/H + 数値) を含むが括弧カップが無い → カップ情報なし。
    out.cup = null;
  } else {
    // (4) 単独英字カップ。前後を非英字で挟まれた 1 文字のみ採用 ("T153 G" → G)。
    //     身長の "T" と被らないよう T を除外 (旧実装と同じ [A-SU-Z])。
    const cupMatch = s.match(/(?:^|[^A-Za-z])([A-SU-Z])(?:$|[^A-Za-z])/);
    if (cupMatch) out.cup = (cupMatch[1] ?? '').toUpperCase();
  }

  return out;
}

function toAbsoluteImageUrl(filename: string): string {
  if (/^https?:\/\//i.test(filename)) return filename;
  return `${IMAGE_BASE}${filename.replace(/^\/+/, '')}`;
}
