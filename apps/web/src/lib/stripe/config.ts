/**
 * Stripe / 課金まわりの定数。クライアントから参照したい値はここに集約する。
 */

export const PLANS = ["monthly", "yearly"] as const;
export type Plan = (typeof PLANS)[number];

export const TRIAL_DAYS = 14;

/** UI に表示する席数上限。サーバ判定にも同じ値を使う。 */
export function getMaxSeats(): number {
  const raw = process.env.NEXT_PUBLIC_MAX_SEATS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // 既定値（仮）。本番では環境変数で必ず指定すること。
  return 30;
}

/** プランごとの Stripe Price ID。サーバ専用 (server action) から参照する。 */
export function getPriceIdFor(plan: Plan): string {
  const id =
    plan === "monthly"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;
  if (!id) {
    throw new Error(
      `NEXT_PUBLIC_STRIPE_PRICE_${plan === "monthly" ? "MONTHLY" : "YEARLY"} が設定されていません`,
    );
  }
  return id;
}

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}
