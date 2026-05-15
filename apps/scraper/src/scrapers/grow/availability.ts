import type {
  AvailabilityRecord,
  AvailabilityScraper,
  Therapist,
} from '@alimashita/shared';
import { HttpError, httpGrow } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://grow-appt.com';
const log = createLogger('grow:availability');

const DISPLAY_DAY_NUM = Math.min(
  Math.max(Number.parseInt(process.env.GROW_DISPLAY_DAYS ?? '14', 10) || 14, 1),
  14,
);

// grow-appt の status API は、同一スタッフでも 1 日の営業時間を約 8 時間ごとの
// シフトグループに分割しており、`group_no` を未指定 / 1 / 2 ... と順に指定しないと
// 全スロットが取得できない。観測されたグループ数は店舗によって異なる（深夜帯まで
// 営業する店舗ほど多くなる）ため、終端（sales が空 or レスポンス全体が null）まで
// 動的にループする。 4 日相当の余地を上限としておく。
const MAX_GROUP_NO = 12;

interface MenuListItem {
  no: number;
  name?: string;
  ordernum?: number;
}

interface MenuResponse {
  menus?: MenuListItem[];
  // Some endpoints return menulist instead of menus
  menulist?: MenuListItem[];
}

interface SalesEntry {
  status?: number;
}

interface StatusResponse {
  messagetime?: string;
  time_separate?: number;
  sales?: Record<string, SalesEntry[]>;
}

class GrowAvailabilityScraper implements AvailabilityScraper {
  private readonly menuCache = new Map<string, number>();

  async run(therapist: Therapist): Promise<AvailabilityRecord[]> {
    const sid = therapist.salon_shop_id;
    const staffNo = therapist.therapist_id;

    const menuNo = await this.getRepresentativeMenuNo(sid, staffNo);
    if (menuNo === null) {
      log.warn('No menu found, skipping', { therapist: therapist.name });
      return [];
    }

    const seldate = todayGrowDate();
    const referer =
      `${BASE_URL}/reserve/order?SID=${encodeURIComponent(sid)}` +
      `&page=time&staff_no=${encodeURIComponent(staffNo)}&menu_no=${menuNo}`;

    // 全グループから集めたスロットを (date, start_time) で重複排除しつつ蓄積。
    // 観測上、グループ間で範囲は重ならないが将来 grow 側の仕様変更に備えた防御。
    const slotMap = new Map<string, AvailabilityRecord>();
    let groupsFetched = 0;

    for (let groupNo = 0; groupNo <= MAX_GROUP_NO; groupNo++) {
      const url = this.buildStatusUrl({ sid, staffNo, menuNo, seldate, groupNo });
      log.info('Fetching status API', {
        therapist: therapist.name,
        group_no: groupNo,
        url,
      });

      // 存在しない group_no に対して grow は HTTP 500 を返す（実機観測）。
      // 終端のシグナルとして扱いたいため、ループ内のリクエストはリトライ無しで叩く。
      // 一時的なネットワーク不調等で 500 が出た場合は次回ジョブ実行で再取得される。
      let json: StatusResponse | null;
      try {
        json = await httpGrow.getJson<StatusResponse | null>(
          url,
          { headers: { Referer: referer } },
          { maxRetries: 0 },
        );
      } catch (err) {
        if (err instanceof HttpError && err.status === 500 && groupNo > 0) {
          log.info('Reached terminal group_no via HTTP 500', {
            therapist: therapist.name,
            group_no: groupNo,
          });
          break;
        }
        throw err;
      }

      // grow は存在しない group_no に対してレスポンス本体が `null` を返すこともあるため、
      // 念のため null / sales 空のケースも終端とみなす。
      if (!json || !json.sales || Object.keys(json.sales).length === 0) {
        if (groupNo === 0) {
          log.info('Empty status response for first group', {
            therapist: therapist.name,
          });
        }
        break;
      }

      groupsFetched++;
      for (const record of parseSales(json.sales)) {
        const key = `${record.date} ${record.start_time}`;
        // 同一 (date, start_time) が複数グループに登場した場合は「空きあり」を優先する。
        // 「埋まり」「空き」が同時に返るケースは無い想定だが、観測誤差で空きを取りこぼす方が痛い。
        const existing = slotMap.get(key);
        if (!existing || (record.is_available && !existing.is_available)) {
          slotMap.set(key, record);
        }
      }
    }

    if (groupsFetched >= MAX_GROUP_NO) {
      log.warn(
        'Hit MAX_GROUP_NO without terminator; grow may have introduced more shift groups',
        { therapist: therapist.name, groupsFetched },
      );
    }

    const records = Array.from(slotMap.values());
    records.sort((a, b) =>
      a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date),
    );
    return records;
  }

  private buildStatusUrl(params: {
    sid: string;
    staffNo: string;
    menuNo: number;
    seldate: string;
    groupNo: number;
  }): string {
    const { sid, staffNo, menuNo, seldate, groupNo } = params;
    let url =
      `${BASE_URL}/reserve/api/reserve/${encodeURIComponent(sid)}/status` +
      `?sid=${encodeURIComponent(sid)}` +
      `&staff_no=${encodeURIComponent(staffNo)}` +
      `&menu_no=${menuNo}` +
      `&seldate=${encodeURIComponent(seldate)}` +
      `&displaydaynum=${DISPLAY_DAY_NUM}` +
      `&coupon_no=&customer_no=`;
    // group_no=0 はパラメータ未指定と同義。実機 (DevTools) の挙動に合わせて
    // 最初のリクエストは付与しない。
    if (groupNo > 0) {
      url += `&group_no=${groupNo}`;
    }
    return url;
  }

  private async getRepresentativeMenuNo(
    sid: string,
    staffNo: string,
  ): Promise<number | null> {
    const cacheKey = `${sid}:${staffNo}`;
    const cached = this.menuCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const url =
      `${BASE_URL}/reserve/api/reserve/${encodeURIComponent(sid)}/menu` +
      `?sid=${encodeURIComponent(sid)}` +
      `&staff_no=${encodeURIComponent(staffNo)}` +
      `&coupon_no=`;
    const referer =
      `${BASE_URL}/reserve/order?SID=${encodeURIComponent(sid)}` +
      `&page=menu&staff_no=${encodeURIComponent(staffNo)}`;

    const json = await httpGrow.getJson<MenuResponse>(url, {
      headers: { Referer: referer },
    });

    const list = json.menus ?? json.menulist ?? [];
    if (list.length === 0) return null;

    const sorted = [...list].sort(
      (a, b) => (a.ordernum ?? Number.MAX_SAFE_INTEGER) - (b.ordernum ?? Number.MAX_SAFE_INTEGER),
    );
    const first = sorted[0];
    if (!first || !Number.isFinite(first.no)) return null;

    this.menuCache.set(cacheKey, first.no);
    return first.no;
  }
}

function parseSales(sales: StatusResponse['sales']): AvailabilityRecord[] {
  if (!sales) return [];

  const records: AvailabilityRecord[] = [];
  for (const [key, entries] of Object.entries(sales)) {
    const m = key.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const date = m[1]!;
    const hour = m[2]!.padStart(2, '0');
    const startTime = `${hour}:${m[3]}:00`;

    const status = Array.isArray(entries) && entries.length > 0 ? entries[0]?.status : undefined;
    // status: 1 = 出勤なし、2 = 埋まり、4 = 予約可能（grow-appt API）
    // 出勤なし（1）は availability に書かない。書いてしまうと「シフト＝行が存在する」
    // という派生ルールが成り立たなくなり、シフト日数の集計や "次の出勤日" の算出が
    // 不正確になる。埋まり（2）と予約可能（4）はどちらもシフト中なので両方書く。
    if (status !== 2 && status !== 4) continue;
    records.push({ date, start_time: startTime, is_available: status === 4 });
  }

  // 並び替えは呼び出し側（グループ横断で集約後）にまとめて行う。
  return records;
}

function todayGrowDate(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('/');
}

export const growAvailabilityScraper: AvailabilityScraper = new GrowAvailabilityScraper();
