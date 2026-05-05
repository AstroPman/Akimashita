import type { Salon, TherapistRecord, TherapistScraper } from '@alimashita/shared';
import { httpGrow } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://grow-appt.com';
const log = createLogger('grow:therapists');

interface GrowStaff {
  no: number;
  image?: string | null;
  name: string;
  message?: string | null;
  ordernum?: number;
  starttime?: string;
  endtime?: string;
}

interface GrowStaffResponse {
  freebtn_disp?: number;
  messagestaff?: string;
  stafflist?: GrowStaff[];
}

class GrowTherapistScraper implements TherapistScraper {
  async run(salon: Salon): Promise<TherapistRecord[]> {
    const sid = salon.shop_id;

    const staffPageUrl = `${BASE_URL}/reserve/order?SID=${sid}&page=staff`;
    log.info(`Warming session via staff page`, { salon: salon.name, url: staffPageUrl });
    await httpGrow.getHtml(staffPageUrl).catch((err) => {
      log.warn(`Failed to warm session (continuing)`, { error: errMessage(err) });
    });

    const apiUrl =
      `${BASE_URL}/reserve/api/reserve/${encodeURIComponent(sid)}/staff` +
      `?sid=${encodeURIComponent(sid)}&staff_id=&coupon_id=`;
    log.info(`Fetching staff list API`, { salon: salon.name, url: apiUrl });

    const json = await httpGrow.getJson<GrowStaffResponse>(apiUrl, {
      headers: {
        Referer: staffPageUrl,
      },
    });

    const staffList = json.stafflist ?? [];
    const records: TherapistRecord[] = staffList
      .filter((s) => Number.isFinite(s.no) && (s.name ?? '').trim() !== '')
      .map((s) => ({
        therapist_id: String(s.no),
        name: s.name.trim(),
        profile_url: `${BASE_URL}/reserve/order?SID=${sid}&page=staff&staff_id=${s.no}`,
        image_url: s.image ?? null,
        description: s.message?.trim() || null,
      }));

    log.info(`Parsed ${records.length} therapists`, { salon: salon.name });
    return records;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const growTherapistScraper: TherapistScraper = new GrowTherapistScraper();
