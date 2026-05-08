import type {
  AvailabilityRecord,
  AvailabilityScraper,
  Therapist,
} from '@alimashita/shared';
import { httpGrow } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://grow-appt.com';
const log = createLogger('grow:availability');

const DISPLAY_DAY_NUM = Math.min(
  Math.max(Number.parseInt(process.env.GROW_DISPLAY_DAYS ?? '14', 10) || 14, 1),
  14,
);

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
    const url =
      `${BASE_URL}/reserve/api/reserve/${encodeURIComponent(sid)}/status` +
      `?sid=${encodeURIComponent(sid)}` +
      `&staff_no=${encodeURIComponent(staffNo)}` +
      `&menu_no=${menuNo}` +
      `&seldate=${encodeURIComponent(seldate)}` +
      `&displaydaynum=${DISPLAY_DAY_NUM}` +
      `&coupon_no=&customer_no=`;

    log.info('Fetching status API', { therapist: therapist.name, url });
    const referer =
      `${BASE_URL}/reserve/order?SID=${encodeURIComponent(sid)}` +
      `&page=time&staff_no=${encodeURIComponent(staffNo)}&menu_no=${menuNo}`;

    const json = await httpGrow.getJson<StatusResponse>(url, {
      headers: { Referer: referer },
    });

    return parseSales(json.sales);
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

  records.sort((a, b) =>
    a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date),
  );
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
