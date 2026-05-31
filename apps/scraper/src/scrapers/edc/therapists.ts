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

/** 全角英数字を半角へ正規化し、後段の正規表現を単純化する。 */
function toHalfWidth(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

interface EdcBodyProfile {
  height: number | null;
  bust: number | null;
  waist: number | null;
  hip: number | null;
  cup: string | null;
}

/**
 * edc の予約ウィザードには身長・3 サイズ・カップの専用フィールドが無い。
 * 観測した限り `itemComment` は自己紹介や料金案内が主で、サイズ表記を持つ
 * ケースは稀だが、もし標準形 ("T.160cm B.85(D) W.55 H.85" 等) が書かれていれば
 * 取りこぼさないよう、grow と同じ高確度パターンだけを保守的に拾う。
 *
 * - 3 サイズは `B..(cup) W.. H..` の連続パターンを必須にして誤検出を避ける。
 * - 身長は cm 接尾辞付きの `T.160cm` 系トークンに限定する。
 * - カップは B の括弧内を最優先、無ければ散文中の "Gカップ" を fallback。
 * - 取れない項目は null のまま (= 既存挙動を壊さない)。
 */
function parseEdcBodyProfile(comment: string | null | undefined): EdcBodyProfile {
  const out: EdcBodyProfile = { height: null, bust: null, waist: null, hip: null, cup: null };
  if (!comment) return out;
  const m = toHalfWidth(comment);

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

  return out;
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

        const rawComment = $el.find('.itemComment').first().text();
        const description = normalizeText(rawComment) || null;
        const { height, bust, waist, hip, cup } = parseEdcBodyProfile(rawComment);

        records.set(therapistId, {
          therapist_id: therapistId,
          name,
          profile_url: null,
          image_url: imageUrl,
          description,
          age,
          height,
          bust,
          waist,
          hip,
          cup,
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
