import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Tokyo";

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return value.toLocaleString("ja-JP");
}

export function formatPercent(
  numerator: number,
  denominator: number,
  fractionDigits = 1,
): string {
  if (denominator <= 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(fractionDigits)}%`;
}

export function formatDateJst(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return dayjs(value).tz(TZ).format("YYYY-MM-DD");
}

export function formatDateTimeJst(
  value: string | Date | null | undefined,
): string {
  if (!value) return "-";
  return dayjs(value).tz(TZ).format("YYYY-MM-DD HH:mm");
}

export function formatRelativeFromNow(
  value: string | Date | null | undefined,
): string {
  if (!value) return "-";
  const diffSec = dayjs().diff(dayjs(value), "second");
  if (diffSec < 60) return `${diffSec}秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr}時間前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}日前`;
}

export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 60) return `${value.toFixed(1)}秒`;
  if (value < 3600) return `${(value / 60).toFixed(1)}分`;
  return `${(value / 3600).toFixed(1)}時間`;
}
