import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpGrow } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://grow-appt.com';
const log = createLogger('grow:therapists');

interface GrowStaff {
  no: number;
  image?: string | null;
  name: string;
  message?: string | null;
  ordernum?: number;
  starttime?: string;
  endtime?: string;
}

interface GrowStaffResponse {
  freebtn_disp?: number;
  messagestaff?: string;
  stafflist?: GrowStaff[];
}

interface GrowProfile {
  age: number | null;
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
 * grow には年齢・身長・3 サイズの専用フィールドが無く、すべて自由記述の
 * `message` 先頭に埋め込まれる。サロン・セラピストによって有無も書式も異なるため、
 * 高確度なパターンだけを保守的に拾い、取れない項目は null のままにする。
 *
 * 代表書式 (size 表記を持つメッセージの ~9 割):
 *   "23歳 T.160cm B.86(D) W.55 H.85 ..."
 *
 * - 3 サイズは `B..(cup) W.. H..` の連続パターンを必須にして誤検出を抑える。
 * - カップは B の括弧内を最優先、無ければ散文中の "Gカップ" 等を fallback で拾う。
 * - 身長は誤検出を避けるため `T.160cm` のように cm 接尾辞付きトークンに限定する。
 */
function parseGrowProfile(message: string | null | undefined): GrowProfile {
  const out: GrowProfile = { age: null, height: null, bust: null, waist: null, hip: null, cup: null };
  if (!message) return out;
  const m = toHalfWidth(message);

  const bwh = m.match(
    /B\s*[.．]?\s*(\d{2,3})\s*(?:[(（]\s*([A-Za-z]{1,3})\s*[)）])?\s*W\s*[.．]?\s*(\d{2,3})\s*H\s*[.．]?\s*(\d{2,3})/,
  );
  if (bwh) {
    const bust = Number.parseInt(bwh[1]!, 10);
    const waist = Number.parseInt(bwh[3]!, 10);
    const hip = Number.parseInt(bwh[4]!, 10);
    if (bust >= 50 && bust <= 150) out.bust = bust;
    if (waist >= 30 && waist <= 120) out.waist = waist;
    if (hip >= 50 && hip <= 150) out.hip = hip;
    if (bwh[2]) out.cup = bwh[2].toUpperCase();
  }

  if (!out.cup) {
    const cupMatch = m.match(/([A-Za-z])\s*カップ/);
    if (cupMatch) out.cup = cupMatch[1]!.toUpperCase();
  }

  const heightMatch = m.match(/T\s*[.．]?\s*(\d{2,3})\s*(?:cm|㎝)/i);
  if (heightMatch) {
    const h = Number.parseInt(heightMatch[1]!, 10);
    if (h >= 130 && h <= 200) out.height = h;
  }

  const ageMatch = m.match(/(\d{1,2})\s*[歳才]/);
  if (ageMatch) {
    const a = Number.parseInt(ageMatch[1]!, 10);
    if (a >= 18 && a <= 60) out.age = a;
  }

  return out;
}

class GrowTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const sid = salon.shop_id;

    const staffPageUrl = `${BASE_URL}/reserve/order?SID=${sid}&page=staff`;
    log.info(`Warming session via staff page`, { salon: salon.name, url: staffPageUrl });
    await httpGrow.getHtml(staffPageUrl).catch((err) => {
      log.warn(`Failed to warm session (continuing)`, { error: errMessage(err) });
    });

    const apiUrl =
      `${BASE_URL}/reserve/api/reserve/${encodeURIComponent(sid)}/staff` +
      `?sid=${encodeURIComponent(sid)}&staff_id=&coupon_id=`;
    log.info(`Fetching staff list API`, { salon: salon.name, url: apiUrl });

    const json = await httpGrow.getJson<GrowStaffResponse>(apiUrl, {
      headers: {
        Referer: staffPageUrl,
      },
    });

    const staffList = json.stafflist ?? [];
    const records: TherapistRecord[] = staffList
      .filter((s) => Number.isFinite(s.no) && (s.name ?? '').trim() !== '')
      .map((s) => {
        const profile = parseGrowProfile(s.message);
        return {
          therapist_id: String(s.no),
          name: s.name.trim(),
          profile_url: `${BASE_URL}/reserve/order?SID=${sid}&page=staff&staff_id=${s.no}`,
          image_url: s.image ?? null,
          description: s.message?.trim() || null,
          age: profile.age,
          height: profile.height,
          bust: profile.bust,
          waist: profile.waist,
          hip: profile.hip,
          cup: profile.cup,
        };
      });

    log.info(`Parsed ${records.length} therapists`, { salon: salon.name });
    return records;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const growTherapistScraper: TherapistScraper = new GrowTherapistScraper();
