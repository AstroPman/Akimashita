import * as cheerio from 'cheerio';
import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpEyoyaku } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('eyoyaku:therapists');

const BASE_URL = 'https://e-yoyaku.jp';

/**
 * e-yoyaku.jp の `/shop/{shop_id}/girl/{cast_id}/` パスから cast_id を抽出する。
 * クエリパラメータ (?_ga=... 等) や末尾スラッシュの有無に強い形にする。
 */
function extractCastId(href: string, shopId: string): string | null {
  try {
    const url = new URL(href, BASE_URL);
    const re = new RegExp(`^/shop/${shopId}/girl/(\\d+)/?$`);
    const m = url.pathname.match(re);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

function parseAge(raw: string | undefined): number | null {
  if (!raw) return null;
  // 例: "20歳" / "  20歳 "
  const m = raw.replace(/\s+/g, '').match(/^(\d{2,3})歳$/);
  if (!m) return null;
  const v = Number.parseInt(m[1]!, 10);
  return Number.isFinite(v) ? v : null;
}

function parseHeight(raw: string | undefined): number | null {
  if (!raw) return null;
  // 例: "165cm" / "T.165"
  const m = raw.replace(/\s+/g, '').match(/(\d{2,3})cm/);
  if (!m) return null;
  const v = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(v) || v < 100 || v > 220) return null;
  return v;
}

/**
 * 例: "B:90" / "B:" (値なし) / "B90" / 全角コロン などをパースする。
 * 値が無い (e-yoyaku のサンプルでは大半が空) ケースは null を返す。
 */
function parseSizeLabel(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s+/g, '').match(/[BWH][:：]?(\d{2,3})/i);
  if (!m) return null;
  const v = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(v) || v < 50 || v > 200) return null;
  return v;
}

function normalizeName(raw: string): string {
  // 全角/半角の空白を 1 つに畳む。 e-yoyaku は名前先頭にスペースが入ることがある (例: " るり")。
  return raw.replace(/[\s\u3000]+/g, ' ').trim();
}

function toAbsoluteUrl(src: string | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, BASE_URL).toString();
  } catch {
    return null;
  }
}

/**
 * 想定外のページ数で延々ループしないためのハードリミット。
 * 全129名のシード (shop_id=1760) で 7 ページ。仮に各ページ 5 名でも 50 名で 10 ページ。
 * 50 を超えるショップは現実的にあり得ないので、超えた場合はパース不整合扱いで打ち切る。
 */
const MAX_PAGES = 50;

/**
 * `<span class="pagerInner">N/M</span>` から N と M を取り出す。
 * pager が存在しない (1 ページ完結のショップ) 場合は null を返す。
 */
function parsePagerInfo(html: string): { current: number; total: number } | null {
  const m = html.match(/<span class="pagerInner">(\d+)\/(\d+)<\/span>/);
  if (!m) return null;
  const current = Number.parseInt(m[1]!, 10);
  const total = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total < 1) return null;
  return { current, total };
}

/**
 * 1 ページ分の HTML (フルページ or AJAX 断片) から castList をパースし
 * records Map に追記する。重複 castId は最初の値を優先 (Map.set の通常意味論)。
 */
function extractCastsInto(
  html: string,
  shopId: string,
  records: Map<string, TherapistRecord>,
): void {
  const $ = cheerio.load(html);
  $('div.castList').each((_, el) => {
    const $card = $(el);
    const $link = $card.find('a.castDetail').first();
    const href = $link.attr('href');
    if (!href) return;

    const castId = extractCastId(href, shopId);
    if (!castId) return;
    if (records.has(castId)) return;

    // 名前: <p class="castName"><span class="u-ellipsis">名前</span></p>
    // 取れない場合 (テンプレート差分) は <img alt="名前"> をフォールバック。
    const rawName =
      $link.find('p.castName span.u-ellipsis').first().text() ||
      $link.find('img').first().attr('alt') ||
      '';
    const name = normalizeName(rawName);
    if (!name) return;

    const age = parseAge($link.find('p.size span.age').first().text());
    const height = parseHeight($link.find('p.size span.tall').first().text());
    const bust = parseSizeLabel($link.find('p.size span.bust').first().text());
    const waist = parseSizeLabel($link.find('p.size span.waist').first().text());
    const hip = parseSizeLabel($link.find('p.size span.hip').first().text());

    const imageSrc = $link.find('img').first().attr('src');
    const imageUrl = toAbsoluteUrl(imageSrc);

    const profileUrl = `${BASE_URL}/shop/${encodeURIComponent(shopId)}/girl/${castId}/`;

    records.set(castId, {
      therapist_id: castId,
      name,
      profile_url: profileUrl,
      image_url: imageUrl,
      description: null,
      age,
      height,
      bust,
      waist,
      hip,
    });
  });
}

class EyoyakuTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const shopId = salon.shop_id;
    const listUrl = `${BASE_URL}/shop/${encodeURIComponent(shopId)}/girl/`;
    const ajaxUrl = `${listUrl}ajax/`;

    // サロン境界で CookieJar をローテートする。「別人として新規セッションで店舗を開く」
    // 相当の振る舞いを表現し、ranking-deli.jp 側のセッション軸 bot 検知を回避する。
    // 一方で同一サロン内 (1 ページ目 → AJAX 2..N ページ目) では Jar 共有が必須で、
    // 1 ページ目で発行される XSRF-TOKEN / e_yoyaku_ekichika_session が後続 AJAX で要る。
    httpEyoyaku.rotateCookies();

    log.info('Fetching cast list', { salon: salon.name, url: listUrl });
    const firstHtml = await httpEyoyaku.getHtml(listUrl);

    const records = new Map<string, TherapistRecord>();
    extractCastsInto(firstHtml, shopId, records);

    const pager = parsePagerInfo(firstHtml);
    const totalPages = Math.min(pager?.total ?? 1, MAX_PAGES);

    // ページネーション AJAX は同一サロン内の補助リクエスト。
    // - エンドポイント: POST `${listUrl}ajax/`
    // - 本体: x-www-form-urlencoded (flg=2, recommend=2, page=N, それ以外は空)
    //   ※ flg/recommend はキャストソート画面の状態で、デフォルトの「おすすめ順 + 日時指定なし」を
    //     表すと shop_girl_list.js が page() ハンドラ内で flg=2, recommend="2" を組み立てる。
    // - ヘッダ: X-XSRF-TOKEN (XSRF-TOKEN cookie を decodeURIComponent した値)、
    //   Origin / Referer / X-Requested-With (X-Requested-With は API_HEADERS で自動付与済み)。
    // - レスポンス: HTML 断片 (mod-castBody の中身) で、ページャ要素 `<span class="pagerInner">N/M</span>` も含む。
    for (let page = 2; page <= totalPages; page++) {
      const xsrfRaw = await httpEyoyaku.getCookieValue(BASE_URL, 'XSRF-TOKEN');
      if (!xsrfRaw) {
        log.warn('XSRF-TOKEN cookie missing; aborting pagination', {
          salon: salon.name,
          page,
        });
        break;
      }
      const form = new URLSearchParams({
        flg: '2',
        date: '',
        hour: '',
        minute: '',
        recommend: '2',
        page: String(page),
        coupon_id: '',
        coupon_type: '',
      });
      const fragment = await httpEyoyaku.postForm(ajaxUrl, form, {
        'X-XSRF-TOKEN': decodeURIComponent(xsrfRaw),
        Origin: BASE_URL,
        Referer: listUrl,
      });
      const beforeCount = records.size;
      extractCastsInto(fragment, shopId, records);
      const added = records.size - beforeCount;

      // pager が無い / 進まないページが返ってきた場合は無限ループ防止で抜ける。
      const fragPager = parsePagerInfo(fragment);
      if (!fragPager || fragPager.current !== page) {
        log.warn('AJAX pager mismatch; aborting pagination', {
          salon: salon.name,
          expected: page,
          got: fragPager?.current,
          added,
        });
        break;
      }
      if (added === 0) {
        log.warn('No new casts on AJAX page; aborting pagination', {
          salon: salon.name,
          page,
        });
        break;
      }
    }

    log.info(`Parsed ${records.size} therapists`, {
      salon: salon.name,
      pages: totalPages,
    });
    return [...records.values()];
  }
}

export const eyoyakuTherapistScraper: TherapistScraper = new EyoyakuTherapistScraper();
