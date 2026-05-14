/**
 * 課金プラン定義の集中管理。
 *
 * `plan_tier` / `billing_cycle` は DB の enum と一致させる。
 * 監視数上限・通知遅延・画面アクセス権限などプランごとに揺れる値はここに集約し、
 * 他のレイヤ（pricing UI / watches limits / scraper template など）は
 * 必ずこのモジュールを経由してプラン特性を参照する。
 */

export type PlanTier = "free" | "standard" | "premium";
export type BillingCycle = "monthly" | "yearly";

export const PLAN_TIERS = ["free", "standard", "premium"] as const;
export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export const PAID_TIERS = ["standard", "premium"] as const;

export type PaidTier = (typeof PAID_TIERS)[number];

/** プラン優劣の順序（数値が大きいほど上位）。アップグレード判定に使う。 */
export const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  standard: 1,
  premium: 2,
};

export interface PlanConfig {
  /** 1 アカウントが登録できる watch_settings の最大件数。`Infinity` は無制限。 */
  watchLimit: number;
  /** notify 通知の遅延ミリ秒数（DB の send_after に合わせる）。 */
  notifyDelayMs: number;
  /** 表示用の遅延ラベル */
  notifyDelayLabel: string;
  /** ランキングページ閲覧可否 */
  canAccessRanking: boolean;
  /** 受信箱（通知一覧）閲覧可否 */
  canAccessNotificationsInbox: boolean;
  /** プラン名（日本語） */
  label: string;
  /** UI で要点を箇条書きにするためのフラグ群 */
  bullets: string[];
}

const FIVE_MIN = 5 * 60_000;
const TEN_MIN = 10 * 60_000;

export const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
  free: {
    watchLimit: 1,
    notifyDelayMs: TEN_MIN,
    notifyDelayLabel: "10 分遅延",
    canAccessRanking: false,
    canAccessNotificationsInbox: false,
    label: "無料プラン",
    bullets: [
      "監視できるセラピストは 1 名まで",
      "通知は 10 分遅れ",
      "ランキングや通知履歴は閲覧不可",
    ],
  },
  standard: {
    watchLimit: 10,
    notifyDelayMs: FIVE_MIN,
    notifyDelayLabel: "5 分遅延",
    canAccessRanking: true,
    canAccessNotificationsInbox: true,
    label: "スタンダードプラン",
    bullets: [
      "監視できるセラピストは 10 名まで",
      "通知は 5 分遅れ",
      "ランキング・通知履歴の閲覧",
    ],
  },
  premium: {
    watchLimit: Number.POSITIVE_INFINITY,
    notifyDelayMs: 0,
    notifyDelayLabel: "即時通知",
    canAccessRanking: true,
    canAccessNotificationsInbox: true,
    label: "プレミアムプラン",
    bullets: [
      "監視できるセラピストは無制限",
      "通知は即時",
      "ランキング・通知履歴の閲覧",
    ],
  },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return (
    typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value)
  );
}

export function isPaidTier(tier: PlanTier): tier is PaidTier {
  return tier !== "free";
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return (
    typeof value === "string" &&
    (BILLING_CYCLES as readonly string[]).includes(value)
  );
}

/** 上位プランか同等のプランかを判定する。 */
export function isAtLeastTier(actual: PlanTier, required: PlanTier): boolean {
  return PLAN_RANK[actual] >= PLAN_RANK[required];
}

export function getWatchLimitForTier(tier: PlanTier): number {
  return PLAN_CONFIG[tier].watchLimit;
}

export function getNotifyDelayMs(tier: PlanTier): number {
  return PLAN_CONFIG[tier].notifyDelayMs;
}

/**
 * 有料プランの Price ID を環境変数から取得する。
 * 環境変数名は `STRIPE_PRICE_{TIER}_{CYCLE}` の規約に揃える。
 */
export function getPriceId(tier: PaidTier, cycle: BillingCycle): string {
  const key = priceEnvKey(tier, cycle);
  const id = process.env[key];
  if (!id) {
    throw new Error(`${key} が設定されていません`);
  }
  return id;
}

/** Price ID から (tier, cycle) を逆引きする（Webhook / sync 用）。 */
export function matchPlanByPriceId(
  priceId: string | undefined | null,
): { tier: PaidTier; cycle: BillingCycle } | null {
  if (!priceId) return null;
  for (const tier of PAID_TIERS) {
    for (const cycle of BILLING_CYCLES) {
      if (process.env[priceEnvKey(tier, cycle)] === priceId) {
        return { tier, cycle };
      }
    }
  }
  return null;
}

function priceEnvKey(tier: PaidTier, cycle: BillingCycle): string {
  return `STRIPE_PRICE_${tier.toUpperCase()}_${cycle.toUpperCase()}`;
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "月額",
  yearly: "年額",
};
