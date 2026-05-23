import * as cheerio from 'cheerio';
import type {
  AvailabilityRecord,
  AvailabilityScrapeResult,
  AvailabilityScraper,
  Therapist,
} from '@alimashita/shared';
import { httpEyoyaku } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('eyoyaku:availability');

const BASE_URL = 'https://e-yoyaku.jp';

/**
 * e-yoyaku.jp の `<input name="datetime" value="YYYY-MM-DD HH:MM">` を
 * AvailabilityRecord の `{ date, start_time }` に分解する。
 *
 * - 形式は実機観測で常に `YYYY-MM-DD HH:MM` (秒なし、ローカル=JST)。
 * - 15 分刻みに揃っている (00/15/30/45)。
 */
function parseDatetimeValue(
  value: string,
): { date: string; start_time: string } | null {
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const date = m[1]!;
  const hour = m[2]!.padStart(2, '0');
  const minute = m[3]!;
  return { date, start_time: `${hour}:${minute}:00` };
}

/**
 * `<li class="listItem (free|tel js-tel|none)">` の class 文字列からスロット状態を
 * 判定する。
 *
 * - `free`     : ネット予約可能 → `is_available = true`
 * - `tel`      : 電話のみ受付 (時間近接 / Web 予約打ち切り) → `is_available = true`
 *                (Web で取れる枠ではないが、ユーザに「空きが発生した」事実は伝える価値があるため
 *                `free` と同じく available 扱いにする。 enqueue_notifications で `slot_opened`
 *                のトリガに使われる。)
 * - `none`     : 受付不可 (過去 / 予約済 / 出勤なし) → `is_available = false`
 * - その他    : `null` を返して呼び元でスキップ (将来テンプレ変更時の防御)。
 *
 * 注意: `listItem` だけしか付かない要素は実機では発生しない (free|tel|none の
 * いずれかが必ず付与される)。日付タブ側の `listItem (none )?js-class` は
 * 呼び元で `ul.minutesList > li` にスコープを絞ることで混入を防ぐ。
 */
function classifySlot(classAttr: string | undefined): 'free' | 'tel' | 'none' | null {
  if (!classAttr) return null;
  const tokens = classAttr.split(/\s+/);
  if (tokens.includes('free')) return 'free';
  if (tokens.includes('tel')) return 'tel';
  if (tokens.includes('none')) return 'none';
  return null;
}

class EyoyakuAvailabilityScraper implements AvailabilityScraper {
  async run(therapist: Therapist): Promise<AvailabilityScrapeResult> {
    const shopId = therapist.salon_shop_id;
    const castId = therapist.therapist_id;
    const castUrl = `${BASE_URL}/shop/${encodeURIComponent(shopId)}/girl/${encodeURIComponent(castId)}/`;

    log.info('Fetching cast page', { therapist: therapist.name, url: castUrl });
    const html = await httpEyoyaku.getHtml(castUrl);
    const $ = cheerio.load(html);

    // 1 リクエストで 7-8 日分の 15 分刻みスロットが SSR HTML に全部入っている
    // (estama のように「次週は POST で取り直し」が不要)。 dl.timeList 配下の
    // ul.minutesList > li.listItem だけを対象にして、日付タブ側の listItem を弾く。
    const records = new Map<string, AvailabilityRecord>();
    const observed = new Set<string>();
    let freeCount = 0;
    let telCount = 0;
    let noneCount = 0;
    let skipped = 0;

    $('dl.timeList ul.minutesList > li.listItem').each((_, li) => {
      const $li = $(li);
      const state = classifySlot($li.attr('class'));
      if (!state) {
        skipped += 1;
        return;
      }

      const datetime = $li.find('input[name="datetime"]').first().attr('value');
      if (!datetime) {
        skipped += 1;
        return;
      }
      const parsed = parseDatetimeValue(datetime);
      if (!parsed) {
        skipped += 1;
        return;
      }

      const is_available = state === 'free' || state === 'tel';
      const key = `${parsed.date}T${parsed.start_time}`;
      const record: AvailabilityRecord = { ...parsed, is_available };

      // 同一 (date, start_time) が複数登場した場合は「空きあり」を優先する。
      // 実機では timeList のループ構造上重複しないが、テンプレ変動への防御。
      const existing = records.get(key);
      if (!existing || (record.is_available && !existing.is_available)) {
        records.set(key, record);
      }

      // free/tel/none いずれであっても「その日のスケジュールを観測した」事実は確定。
      // none-only (= 全枠埋まり) な日でも observedDates に入れる必要があるので
      // ここで都度 add する。
      observed.add(parsed.date);

      if (state === 'free') freeCount += 1;
      else if (state === 'tel') telCount += 1;
      else noneCount += 1;
    });

    const result = [...records.values()];
    result.sort((a, b) =>
      a.date === b.date
        ? a.start_time.localeCompare(b.start_time)
        : a.date.localeCompare(b.date),
    );

    log.info(`Parsed ${result.length} slots`, {
      therapist: therapist.name,
      free: freeCount,
      tel: telCount,
      none: noneCount,
      skipped,
      observedDays: observed.size,
    });
    return { records: result, observedDates: [...observed].sort() };
  }
}

export const eyoyakuAvailabilityScraper: AvailabilityScraper =
  new EyoyakuAvailabilityScraper();
