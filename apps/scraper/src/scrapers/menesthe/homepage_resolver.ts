import type { ExternalSalonBooking, BookingSiteName } from '@alimashita/shared';
import { HttpError, httpHomepage } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('menesthe:homepage_resolver');

/**
 * 既知の予約システムURL パターン。
 * site_name は我々の sites.name と完全に一致させる。
 * - caskan:  https://r.caskan.jp/{shop_id}
 * - grow:    https://grow-appt.com/reserve/{shop_id}/ または reserve?SID= / reserve/review?SID= 等
 * - edc:     https?://reserve-{shop_id}.esthe-datacenter.com[...]
 * - estama:  https://estama.jp/shop/{shop_id}/
 *
 * 注意:
 *   - `g` フラグ + 反復実行のために state-fullness を避けるべく、関数内で都度 new RegExp。
 *   - 大文字小文字混在の URL は normalize しないと重複検出になるが、shop_id 部分のみ
 *     比較に使うため URL 全体の case 差は許容する。重複は Map で吸収。
 */
const PATTERNS: Array<{ site: BookingSiteName; build: () => RegExp; pickShopId: (m: RegExpExecArray) => string }> = [
  {
    site: 'caskan',
    build: () => /https?:\/\/r\.caskan\.jp\/([a-zA-Z0-9_-]+)(?:[/?#][^\s"'<>]*)?/gi,
    pickShopId: (m) => m[1] ?? '',
  },
  {
    site: 'grow',
    // `/reserve/review?SID=` は下の SID 行に任せ、ここで review を shop_id にしない。
    build: () =>
      /https?:\/\/grow-appt\.com\/reserve\/(?!review(?:\/|\?))([a-zA-Z0-9]+)\/?(?:[?#][^\s"'<>]*)?/gi,
    pickShopId: (m) => m[1] ?? '',
  },
  {
    site: 'grow',
    build: () =>
      /https?:\/\/grow-appt\.com\/reserve(?:\/[a-zA-Z0-9_-]+)*\/?\?(?:[^&\s"'<>]+&)*SID=([a-zA-Z0-9]+)/gi,
    pickShopId: (m) => m[1] ?? '',
  },
  {
    site: 'edc',
    build: () => /https?:\/\/reserve-(\d+)\.esthe-datacenter\.com(?:[/?#][^\s"'<>]*)?/gi,
    pickShopId: (m) => m[1] ?? '',
  },
  {
    site: 'estama',
    build: () => /https?:\/\/estama\.jp\/shop\/(\d+)\/?(?:[?#][^\s"'<>]*)?/gi,
    pickShopId: (m) => m[1] ?? '',
  },
];

export interface ResolveHomepageResult {
  /** 検出した予約システムリンク (重複除去済み)。 */
  bookings: ExternalSalonBooking[];
  /** 取得に成功したか。失敗時はログ目的の理由文字列。 */
  ok: boolean;
  reason?: string;
}

/**
 * 公式サイトが恒久的に参照不能とみなせる失敗か。
 * bookings フェーズで `external_salons.deleted_at` を打つ判断に使う。
 * 403 / 5xx / ネットワーク途切れ等は再試行の余地があるため含めない。
 */
export function shouldSoftDeleteExternalSalonForHomepageFailure(reason: string | undefined): boolean {
  if (!reason) return false;
  if (reason === 'invalid scheme' || reason === 'invalid_url') return true;
  const m = /^http_(\d{3})$/.exec(reason);
  if (!m) return false;
  const status = Number(m[1]);
  return status === 404 || status === 410;
}

/**
 * 公式サイトのトップページ HTML を取得し、既知パターンの予約URLを抽出する。
 * - ネットワーク失敗 / 4xx は ok:false で返す (上位ジョブで「次回再試行 or skip」を選ぶ)。
 * - 抽出は HTML 文字列を正規表現で走査する単純実装。SPA 等で href が JS 注入の場合は
 *   見つからないが、その場合はそもそも HTML に書かれていないため諦める。
 */
export async function resolveHomepage(homepageUrl: string): Promise<ResolveHomepageResult> {
  if (!/^https?:\/\//i.test(homepageUrl)) {
    return { bookings: [], ok: false, reason: 'invalid scheme' };
  }

  let html: string;
  try {
    html = await httpHomepage.getHtml(homepageUrl);
  } catch (err) {
    if (err instanceof HttpError) {
      log.warn('Homepage fetch HTTP error', { url: homepageUrl, status: err.status });
      return { bookings: [], ok: false, reason: `http_${err.status}` };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof TypeError && /invalid url/i.test(message)) {
      log.warn('Homepage URL invalid', { url: homepageUrl, error: message });
      return { bookings: [], ok: false, reason: 'invalid_url' };
    }
    log.warn('Homepage fetch failed', { url: homepageUrl, error: message });
    return { bookings: [], ok: false, reason: 'network_error' };
  }

  const bookings = extractBookings(html);
  log.info(`Resolved ${bookings.length} booking link(s)`, { url: homepageUrl });
  return { bookings, ok: true };
}

export function extractBookings(html: string): ExternalSalonBooking[] {
  const map = new Map<string, ExternalSalonBooking>();
  for (const def of PATTERNS) {
    const re = def.build();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const shopId = def.pickShopId(m).trim();
      if (!shopId) continue;
      const key = `${def.site}:${shopId}`;
      if (map.has(key)) continue;
      map.set(key, {
        site_name: def.site,
        shop_id: shopId,
        booking_url: m[0],
      });
    }
  }
  return [...map.values()];
}
