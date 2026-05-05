import * as cheerio from 'cheerio';
import type { AvailabilityRecord, AvailabilityScraper, Therapist } from '@alimashita/shared';
import { httpCaskan } from '../../lib/http.js';
import { createLogger } from '../../lib/logger.js';

const BASE_URL = 'https://r.caskan.jp';
const log = createLogger('caskan:availability');

const MAX_LOOKAHEAD_DAYS = Number.parseInt(process.env.MAX_LOOKAHEAD_DAYS ?? '14', 10);

class CaskanAvailabilityScraper implements AvailabilityScraper {
  async run(therapist: Therapist): Promise<AvailabilityRecord[]> {
    const dates = await this.fetchShiftDates(therapist);
    if (dates.length === 0) {
      log.info('No shift dates', { therapist: therapist.name });
      return [];
    }

    const today = todayIsoDate();
    const horizon = addDaysIso(today, MAX_LOOKAHEAD_DAYS);
    const targetDates = dates.filter((d) => d >= today && d <= horizon);

    log.info(`Crawling ${targetDates.length} date(s)`, {
      therapist: therapist.name,
      from: targetDates[0],
      to: targetDates[targetDates.length - 1],
    });

    const records: AvailabilityRecord[] = [];
    for (const date of targetDates) {
      try {
        const slots = await this.fetchDaySlots(therapist, date);
        records.push(...slots);
      } catch (err) {
        log.warn('Failed to fetch slots for date', {
          therapist: therapist.name,
          date,
          error: errMessage(err),
        });
      }
    }
    return records;
  }

  private async fetchShiftDates(therapist: Therapist): Promise<string[]> {
    const url = `${BASE_URL}/${therapist.salon_shop_id}/cast/${therapist.therapist_id}`;
    const html = await httpCaskan.getHtml(url);
    const $ = cheerio.load(html);

    const dates = new Set<string>();
    $('table.tbl-therapist-calendar a[href*="cast_id="]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const m = href.match(/[?&]date=(\d{4}-\d{2}-\d{2})/);
      if (m && m[1]) dates.add(m[1]);
    });

    return [...dates].sort();
  }

  private async fetchDaySlots(
    therapist: Therapist,
    date: string,
  ): Promise<AvailabilityRecord[]> {
    const url =
      `${BASE_URL}/${therapist.salon_shop_id}` +
      `?cast_id=${encodeURIComponent(therapist.therapist_id)}&date=${date}`;
    const html = await httpCaskan.getHtml(url);
    const $ = cheerio.load(html);

    const dd = $(`#cast-hour-${cssEscape(therapist.therapist_id)}`);
    if (dd.length === 0) {
      return [];
    }

    const table = dd.find('table.tbl-shift').first();
    if (table.length === 0) {
      return [];
    }

    const rows = table.find('tr');
    if (rows.length < 2) return [];

    const headerCells = $(rows[0]).find('th');
    const slotCells = $(rows[1]).find('td');
    if (headerCells.length === 0 || headerCells.length !== slotCells.length) {
      return [];
    }

    const records = new Map<string, AvailabilityRecord>();

    headerCells.each((idx, th) => {
      const td = slotCells.eq(idx);
      const input = td.find('input[name="hour"]').first();
      const rawValue = input.attr('value');

      let recordDate = date;
      let startTime: string | null = null;

      if (rawValue) {
        const parsed = parseDatetimeValue(rawValue);
        if (parsed) {
          recordDate = parsed.date;
          startTime = parsed.time;
        }
      }

      if (!startTime) {
        startTime = normalizeTimeText($(th).text());
      }
      if (!startTime) return;

      const isAvailable = input.length > 0;
      const key = `${recordDate}T${startTime}`;
      records.set(key, {
        date: recordDate,
        start_time: startTime,
        is_available: isAvailable,
      });
    });

    return [...records.values()];
  }
}

function parseDatetimeValue(value: string): { date: string; time: string } | null {
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = m[2]!.padStart(2, '0');
  return { date: m[1]!, time: `${hour}:${m[3]}:00` };
}

function normalizeTimeText(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]!.padStart(2, '0')}:${m[2]}:00`;
}

function todayIsoDate(): string {
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

function cssEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const caskanAvailabilityScraper: AvailabilityScraper = new CaskanAvailabilityScraper();
