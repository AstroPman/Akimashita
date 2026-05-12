import * as cheerio from 'cheerio';
import type {
  AvailabilityRecord,
  AvailabilityScraper,
  Therapist,
} from '@alimashita/shared';
import { httpEstama } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('estama:availability');

const BASE_URL = 'https://estama.jp';
const DAYS_PER_PAGE = 7;
const MAX_LOOKAHEAD_DAYS = Math.max(
  1,
  Number.parseInt(process.env.MAX_LOOKAHEAD_DAYS ?? '14', 10) || 14,
);

interface SchedulePostResponse {
  status?: string;
  html?: string;
}

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function extractCsrfToken(html: string): string | null {
  // <script>...</script> 内に define('CSRF_TOKEN_VALUE', "<hex>") として埋め込まれる。
  const m = html.match(/CSRF_TOKEN_VALUE['"]?\s*,\s*['"]([a-f0-9]{16,})['"]/i);
  return m ? m[1]! : null;
}

function encodeForm(params: Array<[string, string]>): string {
  return params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * estama の `25:30` (深夜) を DB の TIME 範囲 (`00:00`-`23:59`) に正規化する。
 * 24:00 以降は翌日に繰り越す。返り値は `{ date, start_time }` (HH:MM:SS)。
 */
function normalizeDateTime(
  baseDate: string,
  hour: number,
  minute: number,
): { date: string; start_time: string } {
  const dayOffset = Math.floor(hour / 24);
  const normalizedHour = hour % 24;
  const date = dayOffset === 0 ? baseDate : addDaysIso(baseDate, dayOffset);
  const start_time = `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return { date, start_time };
}

function parseTimeText(raw: string): { hour: number; minute: number } | null {
  // 例: "9:30" / " 11:00 " / "25:30"
  const m = raw.replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number.parseInt(m[1]!, 10);
  const minute = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

/**
 * スケジュールテーブルをパースして AvailabilityRecord 配列を返す。
 *
 * - ○ セルは `<a data-path="...?reserve_date=YYYY-MM-DD&reserve_time=HH:MM">` を持つので、
 *   そこから確定的に日付・時刻を取り出す。
 * - × セルは出勤中の埋まり (`is_available=false`)。日付は列ヘッダから推定する。
 * - ─ セルは出勤外なのでレコード化しない (EDC と同じ「行を作らない」ポリシー)。
 *
 * baseDate はテーブル先頭列の日付 (YYYY-MM-DD)。estama は常に「今日 (= 今週)」から
 * 7 日分のテーブルを返すため、外側から baseDate=今日 or 今日+7 を指定する。
 */
function parseSchedule(html: string, baseDate: string): AvailabilityRecord[] {
  const $ = cheerio.load(html);
  const records = new Map<string, AvailabilityRecord>();

  $('.sce_tb tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const rowTimeRaw = $tr.find('th').first().text();
    const rowTime = parseTimeText(rowTimeRaw);

    $tr.find('td').each((idx, td) => {
      const $td = $(td);

      // ○: 予約可能セルは <a data-path="..."> を持つ。
      const $a = $td.find('a[data-path]').first();
      if ($a.length > 0) {
        const dataPath = $a.attr('data-path') ?? '';
        const dateMatch = dataPath.match(/[?&]reserve_date=(\d{4}-\d{2}-\d{2})/);
        const timeMatch = dataPath.match(/[?&]reserve_time=(\d{1,2}):(\d{2})/);
        if (dateMatch && timeMatch) {
          const baseTimeDate = dateMatch[1]!;
          const hour = Number.parseInt(timeMatch[1]!, 10);
          const minute = Number.parseInt(timeMatch[2]!, 10);
          const normalized = normalizeDateTime(baseTimeDate, hour, minute);
          const key = `${normalized.date}T${normalized.start_time}`;
          records.set(key, { ...normalized, is_available: true });
          return;
        }
      }

      // ○ で data-path が読めない／× セル用フォールバック。
      // 行ヘッダの時刻が解釈できなければスキップ (こちらは ─ かパースエラー)。
      if (!rowTime) return;

      const cellText = $td.text().replace(/\s+/g, '');
      if (!cellText) return;

      const columnDate = addDaysIso(baseDate, idx);
      const normalized = normalizeDateTime(columnDate, rowTime.hour, rowTime.minute);
      const key = `${normalized.date}T${normalized.start_time}`;

      if (cellText.includes('○')) {
        // data-path が無いが ○ 文字だけ存在するケース (フェイルセーフ)。
        records.set(key, { ...normalized, is_available: true });
        return;
      }
      if (cellText.includes('×')) {
        records.set(key, { ...normalized, is_available: false });
        return;
      }
      // それ以外 (─ / 空欄など) は出勤外として行を作らない。
    });
  });

  return [...records.values()];
}

class EstamaAvailabilityScraper implements AvailabilityScraper {
  async run(therapist: Therapist): Promise<AvailabilityRecord[]> {
    const castUrl = `${BASE_URL}/shop/${encodeURIComponent(
      therapist.salon_shop_id,
    )}/cast/${encodeURIComponent(therapist.therapist_id)}/`;

    log.info('Fetching cast page', { therapist: therapist.name, url: castUrl });
    const topHtml = await httpEstama.getHtml(castUrl);
    const csrf = extractCsrfToken(topHtml);
    if (!csrf) {
      throw new Error('CSRF_TOKEN_VALUE not found on cast page');
    }

    const records = new Map<string, AvailabilityRecord>();
    const firstWeek = parseSchedule(topHtml, todayIso());
    for (const r of firstWeek) {
      records.set(`${r.date}T${r.start_time}`, r);
    }

    // 14 日 (DAYS_PER_PAGE 超え) を要求された場合は次週を POST で取得。
    // estama は 1 リクエストあたり 7 日固定なので 1 ジャンプで +7 日カバー。
    if (MAX_LOOKAHEAD_DAYS > DAYS_PER_PAGE) {
      try {
        const body = encodeForm([
          ['ctk', csrf],
          ['view', 'therapist'],
          ['week', '1'],
          ['shop_id', therapist.salon_shop_id],
          ['cast_id', therapist.therapist_id],
        ]);
        const resp = await httpEstama.getJson<SchedulePostResponse>(
          `${BASE_URL}/post/shop_schedule_ctrl`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Referer: castUrl,
            },
            body,
          },
        );
        if (resp.status === 'success' && typeof resp.html === 'string') {
          const baseDate = addDaysIso(todayIso(), DAYS_PER_PAGE);
          const secondWeek = parseSchedule(resp.html, baseDate);
          for (const r of secondWeek) {
            records.set(`${r.date}T${r.start_time}`, r);
          }
        } else {
          log.warn('shop_schedule_ctrl returned non-success', {
            therapist: therapist.name,
            status: resp.status,
          });
        }
      } catch (err) {
        log.warn('Failed to fetch second week, continuing with first week only', {
          therapist: therapist.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result = [...records.values()];
    result.sort((a, b) =>
      a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date),
    );
    log.info(`Parsed ${result.length} slots`, { therapist: therapist.name });
    return result;
  }
}

export const estamaAvailabilityScraper: AvailabilityScraper = new EstamaAvailabilityScraper();
