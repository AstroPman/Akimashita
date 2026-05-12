import * as cheerio from 'cheerio';
import type { ExternalSalonListEntry } from '@alimashita/shared';
import { httpMenesthe } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('menesthe:area_salons');

const BASE_URL = 'https://men-esthe.jp';

/**
 * 1 つのエリアに掲載されているサロン一覧を、ページをめくって全件取得する。
 *
 * URL は `area.php?p={N}&id={areaId}` (p は 0-indexed)。
 * ページャは `<div class="pager">` 配下の `<a href="area.php?p=...">` から最大ページ番号を取得して、
 * その値までループする。安全弁として `maxPages` の上限も設ける。
 */
export async function fetchAreaSalons(
  areaSourceId: string,
  options: { maxPages?: number } = {},
): Promise<ExternalSalonListEntry[]> {
  const maxPages = options.maxPages ?? 100;

  const records = new Map<string, ExternalSalonListEntry>();
  let pageIndex = 0;
  let totalPages = 1;

  while (pageIndex < totalPages && pageIndex < maxPages) {
    const url =
      pageIndex === 0
        ? `${BASE_URL}/area.php?id=${encodeURIComponent(areaSourceId)}`
        : `${BASE_URL}/area.php?p=${pageIndex}&id=${encodeURIComponent(areaSourceId)}`;
    log.info('Fetching area page', { area_id: areaSourceId, page: pageIndex + 1, url });

    let html: string;
    try {
      html = await httpMenesthe.getHtml(url);
    } catch (err) {
      log.warn('Area page fetch failed, stopping pagination', {
        area_id: areaSourceId,
        page: pageIndex + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    const parsed = parseAreaPage(html);
    const beforeCount = records.size;
    for (const entry of parsed.entries) {
      if (!records.has(entry.source_id)) records.set(entry.source_id, entry);
    }
    const added = records.size - beforeCount;

    // 初回のみページャ最大値を確定する。以降のページは同じはず。
    if (pageIndex === 0) {
      totalPages = parsed.totalPages;
      log.info('Detected pagination', { area_id: areaSourceId, total_pages: totalPages });
    }

    // 新規が 0 件 ＝ サイト側の都合でページが空になった可能性。早期終了で安全に。
    if (added === 0 && pageIndex > 0) {
      log.info('No new salons on this page, stopping', { area_id: areaSourceId, page: pageIndex + 1 });
      break;
    }

    pageIndex += 1;
  }

  const result = [...records.values()];
  log.info('Finished area crawl', { area_id: areaSourceId, count: result.length });
  return result;
}

/** エリア 1 ページ分の HTML をパースする純粋関数。 */
export function parseAreaPage(html: string): {
  entries: ExternalSalonListEntry[];
  totalPages: number;
} {
  const $ = cheerio.load(html);
  const entries: ExternalSalonListEntry[] = [];
  const seen = new Set<string>();
  $('.salonName').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('h3 a[href*="salon.php?id="]').first();
    const href = $a.attr('href') ?? '';
    const m = href.match(/salon\.php\?id=(\d+)/);
    if (!m) return;
    const sourceId = m[1]!;
    if (seen.has(sourceId)) return;
    seen.add(sourceId);

    const name = normalizeText($a.find('.name').first().text() || $a.text());
    if (!name) return;

    entries.push({
      source_id: sourceId,
      name,
      source_url: `${BASE_URL}/salon.php?id=${sourceId}`,
    });
  });
  return { entries, totalPages: detectTotalPages($) };
}

function detectTotalPages($: cheerio.CheerioAPI): number {
  let maxP = 0;
  $('.pager a[href*="area.php?"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/[?&]p=(\d+)/);
    if (!m) return;
    const p = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(p) && p > maxP) maxP = p;
  });
  // ページャに `次へ` も p= 付きで載るため、p の最大値 + 1 が総ページ数。
  return maxP + 1;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
