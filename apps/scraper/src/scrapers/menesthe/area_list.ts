import * as cheerio from 'cheerio';
import type { ExternalAreaRecord } from '@alimashita/shared';
import { httpMenesthe } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('menesthe:area_list');

const BASE_URL = 'https://men-esthe.jp';

/**
 * area-list.php をパースして 全エリアを取得する。
 *
 * ページ構造は `<div class="Cnt">` 配下に
 *   `<h2>{都道府県}</h2>`
 *   `<h3 class="districtName">{地区}</h3>`?  (省略されることもある)
 *   `<a href="area.php?id={N}"><li>{エリア名}</li></a>` ...
 * が文書順に並ぶ。h2/h3 の出現で state を更新しつつ a を拾う。
 *
 * 注意: 補助メニュー (「個人セラピスト」「サロンランキング」等) 内にも area.php
 * リンクが現れることがあるため、メインコンテンツ `<div class="Cnt">` の
 * 走査に限定する。最初に出てくる <h1>エリア検索</h1> の直下が該当領域。
 */
export async function fetchAreaList(): Promise<ExternalAreaRecord[]> {
  const url = `${BASE_URL}/area-list.php`;
  log.info('Fetching area list', { url });
  const html = await httpMenesthe.getHtml(url);
  const result = parseAreaList(html);
  log.info(`Parsed ${result.length} areas`);
  return result;
}

/** HTML 文字列を入力に、エリア一覧をパースする純粋関数。スモークテスト・単体検証から呼ぶ。 */
export function parseAreaList(html: string): ExternalAreaRecord[] {
  const $ = cheerio.load(html);

  // エリア検索本体は <h1>エリア検索</h1> を含む .Cnt 内に閉じている。
  const $root = $('h1')
    .filter((_, el) => $(el).text().trim() === 'エリア検索')
    .first()
    .closest('.Cnt');
  if ($root.length === 0) {
    log.warn('Could not locate the エリア検索 root section');
    return [];
  }

  const records = new Map<string, ExternalAreaRecord>();

  // descendants() で document order に列挙し、h2/h3/a を順に拾う。
  let currentPrefecture: string | null = null;
  let currentDistrict: string | null = null;

  $root.find('h2, h3, a[href*="area.php?id="]').each((_, el) => {
    // cheerio v1 では domhandler の Element 型が渡り、`type === 'tag'` の場合
    // 小文字のタグ名が `name` に入る。Anchor/Heading の判定にこれを使う。
    const tag = el.type === 'tag' ? el.name : null;
    const $el = $(el);
    if (tag === 'h2') {
      currentPrefecture = normalizeText($el.text());
      currentDistrict = null;
      return;
    }
    if (tag === 'h3') {
      currentDistrict = normalizeText($el.text()) || null;
      return;
    }
    if (tag === 'a') {
      const href = $el.attr('href') ?? '';
      const m = href.match(/area\.php\?id=(\d+)/);
      if (!m) return;
      const sourceId = m[1]!;
      const name = normalizeText($el.find('li').first().text() || $el.text());
      if (!name) return;
      if (records.has(sourceId)) return;

      records.set(sourceId, {
        source_id: sourceId,
        name,
        district: currentDistrict,
        prefecture: currentPrefecture,
        source_url: `${BASE_URL}/area.php?id=${sourceId}`,
      });
    }
  });

  return [...records.values()];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
