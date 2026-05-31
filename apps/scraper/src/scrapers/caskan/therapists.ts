import * as cheerio from 'cheerio';
import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpCaskan } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://r.caskan.jp';
const log = createLogger('caskan:therapists');

function extractTherapistId(href: string): string | null {
  const match = href.match(/\/cast\/([^/?#]+)/);
  return match ? match[1] ?? null : null;
}

function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return new URL(href, BASE_URL).toString();
}

interface CaskanSpec {
  age: number | null;
  height: number | null;
  cup: string | null;
}

/**
 * 一覧ページの `.therapist-datas-spec` テキスト (例 "26歳166㎝(G)") から
 * 年齢・身長・カップを抽出する。
 *
 * - caskan は数値 3 サイズ (B/W/H) を一切持たず、カップのみ括弧内に出る。
 * - サロン差で各項目が欠落しうるため項目別に独立して拾い、非現実値は捨てる。
 * - 身長は半角 `cm` / 全角 `㎝` の両方を許容する。
 */
function parseCaskanSpec(specText: string): CaskanSpec {
  const out: CaskanSpec = { age: null, height: null, cup: null };

  const ageMatch = specText.match(/(\d{1,2})\s*歳/);
  if (ageMatch) {
    const a = Number.parseInt(ageMatch[1]!, 10);
    if (a >= 18 && a <= 60) out.age = a;
  }

  const heightMatch = specText.match(/(\d{2,3})\s*(?:cm|㎝)/i);
  if (heightMatch) {
    const h = Number.parseInt(heightMatch[1]!, 10);
    if (h >= 130 && h <= 200) out.height = h;
  }

  const cupMatch = specText.match(/[(（]\s*([A-Za-z]{1,3})\s*[)）]/);
  if (cupMatch) out.cup = cupMatch[1]!.toUpperCase();

  return out;
}

class CaskanTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const url = `${BASE_URL}/${salon.shop_id}/cast`;
    log.info(`Fetching cast list`, { salon: salon.name, url });

    const html = await httpCaskan.getHtml(url);
    const $ = cheerio.load(html);

    const records = new Map<string, TherapistRecord>();

    $('a.cast-list-select').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href) return;

      const therapistId = extractTherapistId(href);
      if (!therapistId) return;

      const $img = $a.find('img').first();
      const name = ($img.attr('alt') ?? '').trim();
      const imageUrl = $img.attr('src') ?? null;

      if (!name) return;

      records.set(therapistId, {
        therapist_id: therapistId,
        name,
        profile_url: toAbsoluteUrl(href),
        image_url: imageUrl,
      });
    });

    $('a.therapist-datas-name').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href) return;
      const therapistId = extractTherapistId(href);
      if (!therapistId) return;
      const name = $a.text().trim();
      if (!name) return;

      const specText = $a.closest('.therapist-datas-info').find('.therapist-datas-spec').text();
      const { age, height, cup } = parseCaskanSpec(specText);

      const existing = records.get(therapistId);
      if (existing) {
        existing.name = name;
        existing.age = age;
        existing.height = height;
        existing.cup = cup;
      } else {
        records.set(therapistId, {
          therapist_id: therapistId,
          name,
          profile_url: toAbsoluteUrl(href),
          image_url: null,
          age,
          height,
          cup,
        });
      }
    });

    const result = [...records.values()];
    log.info(`Parsed ${result.length} therapists`, { salon: salon.name });
    return result;
  }
}

export const caskanTherapistScraper: TherapistScraper = new CaskanTherapistScraper();
