import * as cheerio from 'cheerio';
import type {
  AvailabilityRecord,
  AvailabilityScrapeResult,
  AvailabilityScraper,
  Therapist,
} from '@alimashita/shared';
import { createHttp } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('edc:availability');

// caskan と同じ環境変数で日数を制御する。1 リクエストあたり 7 日分しか取れないため、
// 8 日以上を要求された場合は warpStep=3 で内部ジャンプして 2 リクエスト目を発行する。
const MAX_LOOKAHEAD_DAYS = Number.parseInt(process.env.MAX_LOOKAHEAD_DAYS ?? '14', 10);

const DAYS_PER_PAGE = 7;

function buildBaseUrl(shopId: string): string {
  return `https://reserve-${shopId}.esthe-datacenter.com`;
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

function encodeForm(params: Array<[string, string]>): string {
  return params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function extractWizardCode(html: string): string | null {
  const m = html.match(/name="wizardCode"\s+value="([^"]+)"/);
  return m ? m[1]! : null;
}

interface CourseCandidate {
  id: string;
  minutes: number;
}

function pickShortestCourseId(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates: CourseCandidate[] = [];
  $('.itemWrap[data-course]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-course');
    if (!id) return;
    const text = $el.find('.courseName').text();
    const m = text.match(/所要時間：(\d+)\s*分/);
    const minutes = m ? Number.parseInt(m[1]!, 10) : Number.MAX_SAFE_INTEGER;
    candidates.push({ id, minutes });
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.minutes - b.minutes);
  return candidates[0]!.id;
}

interface ParsedSchedule {
  records: AvailabilityRecord[];
  /** テーブルが表現していた 7 日分の日付 (= observed range)。パース失敗時は空。 */
  dates: string[];
}

function parseSchedule(html: string): ParsedSchedule {
  const $ = cheerio.load(html);

  const outPutDate = $('.outPutDate').first().text().trim();
  const m = outPutDate.match(/(\d{4})年(\d{2})月(\d{2})日/);
  if (!m) {
    return { records: [], dates: [] };
  }
  const startIso = `${m[1]}-${m[2]}-${m[3]}`;

  // 列インデックス → ISO 日付。Step3 のテーブルは常に 7 日分。
  const dates: string[] = [];
  for (let i = 0; i < DAYS_PER_PAGE; i++) {
    dates.push(addDaysIso(startIso, i));
  }

  const records = new Map<string, AvailabilityRecord>();

  $('.calendarWrap tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const dataTime = $tr.find('th[data-time]').first().attr('data-time');
    if (!dataTime) return;
    const tmatch = dataTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!tmatch) return;
    const startTime = `${tmatch[1]!.padStart(2, '0')}:${tmatch[2]}:00`;

    const tds = $tr.find('td');
    tds.each((idx, td) => {
      if (idx >= dates.length) return;
      const $td = $(td);
      const style = $td.attr('style') ?? '';
      // 出勤外セル: グレー背景 (#EEEEEE) はスキップ。
      if (/background-color\s*:\s*#?eeeeee/i.test(style)) return;

      const $a = $td.find('a[data-dayTime]').first();
      if ($a.length > 0) {
        const dayTime = ($a.attr('data-dayTime') ?? '').trim();
        const dm = dayTime.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (dm) {
          const date = dm[1]!;
          const hour = dm[2]!.padStart(2, '0');
          const minute = dm[3]!;
          const second = (dm[4] ?? '00').padStart(2, '0');
          const time = `${hour}:${minute}:${second}`;
          records.set(`${date}T${time}`, {
            date,
            start_time: time,
            is_available: true,
          });
          return;
        }
        // data-dayTime が解釈不能な場合は列インデックスから補完。
        const fallbackDate = dates[idx]!;
        records.set(`${fallbackDate}T${startTime}`, {
          date: fallbackDate,
          start_time: startTime,
          is_available: true,
        });
        return;
      }

      // 出勤中・予約不可セル (`<span>－</span>` 等)。日付は列ヘッダから組み立てる。
      const date = dates[idx]!;
      records.set(`${date}T${startTime}`, {
        date,
        start_time: startTime,
        is_available: false,
      });
    });
  });

  return { records: [...records.values()], dates };
}

class EdcAvailabilityScraper implements AvailabilityScraper {
  // 店舗ごとに最短コース ID をキャッシュ (店舗内では安定する想定)。
  private readonly courseCache = new Map<string, string>();

  async run(therapist: Therapist): Promise<AvailabilityScrapeResult> {
    const baseUrl = buildBaseUrl(therapist.salon_shop_id);
    const reserveUrl = `${baseUrl}/reserve/`;

    // セラピストごとに独立した CookieJar (PHPSESSID + wizardCode) を確保する。
    // EDC は Step 進行型のためセッションを共有すると別セラピストの状態と干渉する。
    const http = createHttp({ name: 'edc', baseUrl, headers: {} });

    log.info('Fetching reserve top', { therapist: therapist.name, url: reserveUrl });
    const topHtml = await http.getHtml(reserveUrl);
    const wizardCode = extractWizardCode(topHtml);
    if (!wizardCode) {
      throw new Error('wizardCode not found on reserve top page');
    }

    // Step1 → Step2: itemId をセッションに登録してコース選択画面 (Step2) を取得。
    const step2Body = encodeForm([
      ['act', 'next'],
      ['warpStep', ''],
      ['fromStep', '1'],
      ['itemId', therapist.therapist_id],
      ['wizardCode', wizardCode],
      ['couponId', '0'],
    ]);
    const step2Html = await http.getHtml(reserveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: reserveUrl,
      },
      body: step2Body,
    });

    let courseId = this.courseCache.get(therapist.salon_shop_id);
    if (!courseId) {
      const picked = pickShortestCourseId(step2Html);
      if (!picked) {
        throw new Error('No course found on Step2 page');
      }
      courseId = picked;
      this.courseCache.set(therapist.salon_shop_id, courseId);
      log.info('Cached shortest course', { shop_id: therapist.salon_shop_id, courseId });
    }

    // Step2 → Step3: コースを選んで日時カレンダー画面を取得。
    const step3Body = encodeForm([
      ['act', 'next'],
      ['warpStep', ''],
      ['fromStep', '2'],
      ['courseId', courseId],
      ['courseIdArray[]', courseId],
      ['travelCostId', ''],
      ['nominateId', ''],
      ['wizardCode', wizardCode],
    ]);
    const step3Html = await http.getHtml(reserveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: reserveUrl,
      },
      body: step3Body,
    });

    const records = new Map<string, AvailabilityRecord>();
    const observedDates = new Set<string>();

    const firstWeek = parseSchedule(step3Html);
    for (const r of firstWeek.records) {
      records.set(`${r.date}T${r.start_time}`, r);
    }
    for (const d of firstWeek.dates) observedDates.add(d);

    // 7 日 (DAYS_PER_PAGE) を超える期間を要求された場合は warpStep=3 でジャンプし
    // 2 週目を取得する。EDC のテーブルは 7 日固定なので 1 ジャンプで +7 日カバー。
    if (MAX_LOOKAHEAD_DAYS > DAYS_PER_PAGE) {
      const jumpDay = addDaysIso(todayIso(), DAYS_PER_PAGE);
      const jumpBody = encodeForm([
        ['act', 'next'],
        ['warpStep', '3'],
        ['fromStep', '3'],
        ['day', jumpDay],
        ['fromDay', ''],
        ['fromTime', ''],
        ['itemId', therapist.therapist_id],
        ['courseIdArray[]', courseId],
        ['fromDayTime', ''],
        ['toDayTime', ''],
        ['wizardCode', wizardCode],
      ]);
      try {
        const nextHtml = await http.getHtml(reserveUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: reserveUrl,
          },
          body: jumpBody,
        });
        const secondWeek = parseSchedule(nextHtml);
        for (const r of secondWeek.records) {
          records.set(`${r.date}T${r.start_time}`, r);
        }
        for (const d of secondWeek.dates) observedDates.add(d);
      } catch (err) {
        // 2 週目だけ失敗したケース: observedDates には 1 週目だけが残る。
        // 既存 DB 行のうち 2 週目相当のものは触らずに済み、誤クローズを防ぐ。
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
    log.info(`Parsed ${result.length} slots`, {
      therapist: therapist.name,
      observedDays: observedDates.size,
    });
    return { records: result, observedDates: [...observedDates].sort() };
  }
}

export const edcAvailabilityScraper: AvailabilityScraper = new EdcAvailabilityScraper();
