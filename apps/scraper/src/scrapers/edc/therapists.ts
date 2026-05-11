import * as cheerio from 'cheerio';
import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpEdc } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('edc:therapists');

function buildBaseUrl(shopId: string): string {
  return `https://reserve-${shopId}.esthe-datacenter.com`;
}

function toAbsoluteUrl(href: string, baseUrl: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return new URL(href, baseUrl).toString();
}

function parseNameAndAge(raw: string): { name: string; age: number | null } {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const m = trimmed.match(/^(.+?)（(\d+)歳）$/);
  if (m) {
    return { name: m[1]!.trim(), age: Number.parseInt(m[2]!, 10) };
  }
  return { name: trimmed, age: null };
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

class EdcTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const baseUrl = buildBaseUrl(salon.shop_id);
    const reserveUrl = `${baseUrl}/reserve/`;

    log.info('Fetching top page', { salon: salon.name, url: reserveUrl });
    const topHtml = await httpEdc.getHtml(reserveUrl);

    const lengthMatch = topHtml.match(/var\s+itemLength\s*=\s*(\d+)\s*;/);
    const itemLength = lengthMatch ? Number.parseInt(lengthMatch[1]!, 10) : 0;
    if (itemLength <= 0) {
      log.warn('itemLength not found or zero', { salon: salon.name });
      return [];
    }
    log.info(`itemLength=${itemLength}`, { salon: salon.name });

    const records = new Map<string, TherapistRecord>();
    // ピーチネクストのトップページでは offset を 4 ずつ進めて 4 件単位で取得する。
    // 安全のため itemLength 超過したら停止し、最大 itemLength まで反復する。
    const STEP = 4;
    for (let offset = 0; offset < itemLength; offset += STEP) {
      const ajaxUrl = `${baseUrl}/ajax/reserveWizard1ItemList/?offset=${offset}`;
      const html = await httpEdc.getHtml(ajaxUrl, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Referer: reserveUrl,
        },
      });
      const $ = cheerio.load(html);
      let pageCount = 0;
      $('.itemWrap').each((_, el) => {
        const $el = $(el);
        const id = $el.attr('id') ?? '';
        if (!id.startsWith('item_')) return;
        const therapistId = id.slice('item_'.length);
        if (!therapistId) return;

        const rawName = $el.find('.itemName').first().text();
        const { name, age } = parseNameAndAge(rawName);
        if (!name) return;

        const imgSrc = $el.find('.photo img').first().attr('src') ?? null;
        const imageUrl = imgSrc ? toAbsoluteUrl(imgSrc, baseUrl) : null;

        const description = normalizeText($el.find('.itemComment').first().text()) || null;

        records.set(therapistId, {
          therapist_id: therapistId,
          name,
          profile_url: null,
          image_url: imageUrl,
          description,
          age,
        });
        pageCount += 1;
      });
      if (pageCount === 0) {
        log.info('No more items in ajax response, stopping', { offset });
        break;
      }
    }

    log.info(`Parsed ${records.size} therapists`, { salon: salon.name });
    return [...records.values()];
  }
}

export const edcTherapistScraper: TherapistScraper = new EdcTherapistScraper();
