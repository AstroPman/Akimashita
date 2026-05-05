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

      const existing = records.get(therapistId);
      if (existing) {
        existing.name = name;
      } else {
        records.set(therapistId, {
          therapist_id: therapistId,
          name,
          profile_url: toAbsoluteUrl(href),
          image_url: null,
        });
      }
    });

    const result = [...records.values()];
    log.info(`Parsed ${result.length} therapists`, { salon: salon.name });
    return result;
  }
}

export const caskanTherapistScraper: TherapistScraper = new CaskanTherapistScraper();
