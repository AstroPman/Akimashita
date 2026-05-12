import * as cheerio from 'cheerio';
import type { ExternalSalonRecord } from '@alimashita/shared';
import { httpMenesthe } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('menesthe:salon_detail');

const BASE_URL = 'https://men-esthe.jp';

/**
 * salon.php?id={N} のパース結果。
 *
 * - `null`: canonical 不一致 / 名前未取得など、レコードとして扱えないケース。
 *   呼び出し側は論理削除 (missing) で再取得を抑制する。
 * - `{ kind: 'closed' }`: ページ上に `.closeIcon` (`alt="閉店"`) が存在する閉店店舗。
 *   呼び出し側は論理削除し、以降の details / bookings / link 対象から外す。
 * - `{ kind: 'detail', record }`: 営業中サロンの正常パース結果。
 */
export type SalonDetailResult =
  | { kind: 'closed' }
  | { kind: 'detail'; record: ExternalSalonRecord };

/**
 * salon.php?id={N} の詳細ページを 1 件パースする。
 *
 * - エリアID / 名称: パンくず (#BreadScrumb) 内の area.php?id=... を全部拾う。
 *   複数エリア (例: Organic SPA = 五反田/中目黒/目黒/恵比寿) を考慮。
 * - その他フィールド: 右カラムの `<dl>` 内 dt/dd の組から拾う。
 * - homepage_url: `<dt>URL:</dt>` の <a href>。"target=_blank" な外部リンク。
 * - 閉店判定: `.closeIcon` (例: `<div class="closeIcon"><img alt="閉店"/></div>`) があれば closed を返す。
 */
export async function fetchSalonDetail(sourceId: string): Promise<SalonDetailResult | null> {
  const url = `${BASE_URL}/salon.php?id=${encodeURIComponent(sourceId)}`;
  log.info('Fetching salon detail', { source_id: sourceId, url });
  const html = await httpMenesthe.getHtml(url);
  return parseSalonDetail(sourceId, html);
}

/** salon.php?id={N} の HTML を入力にパースする純粋関数。 */
export function parseSalonDetail(sourceId: string, html: string): SalonDetailResult | null {
  const $ = cheerio.load(html);

  // canonical な salon.php?id=N が含まれていない場合 (404 ページ等) はスキップ。
  const canonical = $('link[rel="canonical"]').attr('href') ?? '';
  if (!canonical.includes(`salon.php?id=${sourceId}`)) {
    log.warn('Canonical URL does not match, treating as missing', { source_id: sourceId, canonical });
    return null;
  }

  // 閉店ページは canonical が一致した上で `.closeIcon` バナーが出る。
  // 詳細を埋めても無駄なので closed として早期 return し、呼び出し側で論理削除する。
  if ($('.closeIcon').length > 0) {
    log.info('Salon is marked as closed', { source_id: sourceId });
    return { kind: 'closed' };
  }

  const name = extractName($);
  if (!name) {
    log.warn('Salon name not found', { source_id: sourceId });
    return null;
  }

  const { areaSourceIds, areas } = extractAreasFromBreadcrumb($);
  const dlPairs = extractDlPairs($);

  const nearestStations = parseStations(dlPairs.get('最寄り駅') ?? '');
  const genre = pickText(dlPairs.get('ジャンル') ?? '') || null;
  const priceRange = pickText(dlPairs.get('価格帯') ?? '') || null;
  const openingHours = pickText(dlPairs.get('営業時間') ?? '') || null;
  const homepageUrl = extractHomepageUrl($) || null;

  return {
    kind: 'detail',
    record: {
      source_id: sourceId,
      name,
      prefecture: null, // 都道府県は areas_source_ids → external_areas を引いて job 側で確定する
      areas,
      area_source_ids: areaSourceIds,
      nearest_stations: nearestStations,
      genre,
      price_range: priceRange,
      opening_hours: openingHours,
      homepage_url: homepageUrl,
      source_url: `${BASE_URL}/salon.php?id=${sourceId}`,
    },
  };
}

function extractName($: cheerio.CheerioAPI): string {
  // #salonHead > .Cnt > h1 が正規。fallback としてパンくず最後の name も試す。
  const headH1 = normalizeText($('#salonHead .Cnt h1').first().text());
  if (headH1) return headH1;
  const bcLast = normalizeText(
    $('#BreadScrumb .now [itemprop="name"]').first().text(),
  );
  return bcLast;
}

function extractAreasFromBreadcrumb($: cheerio.CheerioAPI): {
  areaSourceIds: string[];
  areas: string[];
} {
  const ids = new Set<string>();
  const names = new Set<string>();
  $('#BreadScrumb a[href*="area.php?id="]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/area\.php\?id=(\d+)/);
    if (!m) return;
    const id = m[1]!;
    if (ids.has(id)) return;
    ids.add(id);
    // 例: "恵比寿 のメンズエステ" → "恵比寿"
    const raw = $(el).find('[itemprop="name"]').first().text() || $(el).text();
    const cleaned = normalizeText(raw).replace(/\s*のメンズエステ\s*$/, '').trim();
    if (cleaned) names.add(cleaned);
  });
  return {
    areaSourceIds: [...ids],
    areas: [...names],
  };
}

/**
 * ページ上の dt → dd を「ラベル名 → dd の HTML/テキスト」マップに集約する。
 * ラベルは末尾の `:` を除去して正規化。同名ラベルが複数ある場合は最初の出現を優先する。
 */
function extractDlPairs($: cheerio.CheerioAPI): Map<string, string> {
  const map = new Map<string, string>();
  $('dl > dt').each((_, dt) => {
    const $dt = $(dt);
    const $dd = $dt.next('dd');
    if ($dd.length === 0) return;
    const label = normalizeText($dt.text()).replace(/[:：]\s*$/, '');
    if (!label) return;
    if (map.has(label)) return;
    map.set(label, $dd.html() ?? '');
  });
  return map;
}

function pickText(htmlOrText: string): string {
  // dd の中に img/span/a が混じるため、cheerio で再パースしてテキスト抽出する。
  // 単純な文字列に対しても安全に動作する。
  if (!htmlOrText) return '';
  const $ = cheerio.load(`<root>${htmlOrText}</root>`);
  return normalizeText($('root').text());
}

function parseStations(ddHtml: string): string[] {
  const text = pickText(ddHtml);
  if (!text) return [];
  // 例: "恵比寿駅,目黒駅,中目黒駅,五反田駅" / "新橋駅" / "渋谷駅・恵比寿駅"
  // 区切りはカンマ・読点・中黒・全角カンマを許容。空要素は除外。
  return text
    .split(/[,、，・]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractHomepageUrl($: cheerio.CheerioAPI): string {
  // dt/dd ペアの "URL" 直下の最初の <a href> が公式サイトURL。
  let found = '';
  $('dl > dt').each((_, dt) => {
    if (found) return;
    const $dt = $(dt);
    const label = normalizeText($dt.text()).replace(/[:：]\s*$/, '');
    if (label !== 'URL') return;
    const href = $dt.next('dd').find('a[href]').first().attr('href') ?? '';
    if (href && /^https?:\/\//i.test(href)) {
      found = href.trim();
    }
  });
  return found;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
