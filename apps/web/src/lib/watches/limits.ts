import { getWatchLimitForTier, type PlanTier } from "@/lib/plans";

/**
 * 監視設定の上限件数は plan_tier ごとに決まる。
 * UI 表示・サーバ判定の双方でこの関数を経由して値を取得する。
 *
 * `Number.POSITIVE_INFINITY` は「無制限」を意味する。UI 側では数値
 * リテラル表示を避け、専用ラベルにフォールバックする。
 */
export function watchLimitFor(tier: PlanTier): number {
  return getWatchLimitForTier(tier);
}

export function isUnlimited(limit: number): boolean {
  return !Number.isFinite(limit);
}
