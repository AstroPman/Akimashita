import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/ja";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ja");

export const JST = "Asia/Tokyo";

export function nowJst() {
  return dayjs().tz(JST);
}

export function todayJstDate(): string {
  return nowJst().format("YYYY-MM-DD");
}

export function formatJstDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  return dayjs(value).tz(JST).format("YYYY/MM/DD HH:mm");
}

export function formatJstDate(value: string | Date | null | undefined) {
  if (!value) return "";
  return dayjs(value).tz(JST).format("YYYY/MM/DD (ddd)");
}

export function formatTimeRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from && !to) return "時間指定なし";
  const f = from ? from.slice(0, 5) : "--:--";
  const t = to ? to.slice(0, 5) : "--:--";
  return `${f} - ${t}`;
}

export { dayjs };
