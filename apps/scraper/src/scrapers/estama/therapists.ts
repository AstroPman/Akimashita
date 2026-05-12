import * as cheerio from 'cheerio';
import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpEstama } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('estama:therapists');

const BASE_URL = 'https://estama.jp';

function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return new URL(href, BASE_URL).toString();
}

function parseNameAndAge(raw: string): { name: string; age: number | null } {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  // 例: "鈴香るい(27)" / "神谷 ゆうか(24)"
  const m = trimmed.match(/^(.+?)\s*\((\d+)\)\s*$/);
  if (m) {
    return { name: m[1]!.trim(), age: Number.parseInt(m[2]!, 10) };
  }
  return { name: trimmed, age: null };
}

function parseHeight(raw: string): number | null {
  // 例: "T.165" / "T.165 "
  const m = raw.match(/T\.?\s*(\d{2,3})/);
  if (!m) return null;
  const v = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(v) || v < 100 || v > 220) return null;
  return v;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
}

class EstamaTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const listUrl = `${BASE_URL}/shop/${encodeURIComponent(salon.shop_id)}/cast/`;
    log.info('Fetching cast list', { salon: salon.name, url: listUrl });

    const html = await httpEstama.getHtml(listUrl);
    const $ = cheerio.load(html);

    const records = new Map<string, TherapistRecord>();

    $('.therapist_list a.link-detail').each((_, el) => {
      const $link = $(el);
      const href = $link.attr('href');
      if (!href) return;
      const idMatch = href.match(/\/cast\/(\d+)\/?/);
      if (!idMatch) return;
      const therapistId = idMatch[1]!;

      // link-detail を含む figure 全体がカード本体。
      const $card = $link.closest('figure');
      if ($card.length === 0) return;

      const rawName = $card.find('h4').first().text();
      const { name, age } = parseNameAndAge(rawName);
      if (!name) return;

      const heightText = $card.find('p').first().text();
      const height = parseHeight(heightText);

      const imgSrc = $card.find('img.therapist__img').first().attr('src') ?? null;
      const imageUrl = imgSrc ? toAbsoluteUrl(imgSrc) : null;

      const $note = $card.find('.t-now').first();
      const description =
        $note.length > 0 ? normalizeWhitespace($note.text()) || null : null;
      const profileUrl = toAbsoluteUrl(href);

      records.set(therapistId, {
        therapist_id: therapistId,
        name,
        profile_url: profileUrl,
        image_url: imageUrl,
        description,
        age,
        height,
      });
    });

    log.info(`Parsed ${records.size} therapists`, { salon: salon.name });
    return [...records.values()];
  }
}

export const estamaTherapistScraper: TherapistScraper = new EstamaTherapistScraper();
