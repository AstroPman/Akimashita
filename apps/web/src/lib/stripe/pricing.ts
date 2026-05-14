import "server-only";

import { cache } from "react";
import type Stripe from "stripe";
import { getStripe } from "./server";
import {
  BILLING_CYCLES,
  PAID_TIERS,
  getPriceId,
  type BillingCycle,
  type PaidTier,
} from "@/lib/plans";

/**
 * 1 プラン分の表示用価格情報。料金ページ等から参照する。
 *
 * - `amount` は currency の最小単位（JPY は円、USD はセント）
 * - `priceLabel` / `periodLabel` / `note` はすでに日本語化済みの表示文字列
 */
export interface PlanPricing {
  tier: PaidTier;
  cycle: BillingCycle;
  priceId: string;
  amount: number;
  currency: string;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount: number;
  priceLabel: string;
  periodLabel: string;
  note: string;
}

/** tier x cycle の全組み合わせのマップ。 */
export type PlanPricingMap = Record<PaidTier, Record<BillingCycle, PlanPricing>>;

/**
 * Stripe 上の最新価格を取得する。同一リクエスト内では React の `cache` でメモ化。
 * note は同じ tier の月額・年額が揃っているときのみ「実質 ¥X / 月」を算出する。
 */
export const getPlanPricing = cache(async (): Promise<PlanPricingMap> => {
  const stripe = getStripe();
  const entries = await Promise.all(
    PAID_TIERS.flatMap((tier) =>
      BILLING_CYCLES.map(async (cycle) => {
        const priceId = getPriceId(tier, cycle);
        const price = await stripe.prices.retrieve(priceId);
        return { tier, cycle, price };
      }),
    ),
  );

  // tier ごとの「monthly / yearly」参照を作っておき、年額の note 計算で使う
  const byTier = new Map<PaidTier, Partial<Record<BillingCycle, Stripe.Price>>>();
  for (const { tier, cycle, price } of entries) {
    const inner = byTier.get(tier) ?? {};
    inner[cycle] = price;
    byTier.set(tier, inner);
  }

  const result = {} as PlanPricingMap;
  for (const { tier, cycle, price } of entries) {
    const refs = byTier.get(tier) ?? {};
    if (!result[tier]) {
      result[tier] = {} as Record<BillingCycle, PlanPricing>;
    }
    result[tier][cycle] = toPlanPricing(tier, cycle, price, {
      monthly: refs.monthly ?? null,
      yearly: refs.yearly ?? null,
    });
  }
  return result;
});

function toPlanPricing(
  tier: PaidTier,
  cycle: BillingCycle,
  price: Stripe.Price,
  refs: { monthly: Stripe.Price | null; yearly: Stripe.Price | null },
): PlanPricing {
  if (!price.recurring) {
    throw new Error(`price ${price.id} は recurring ではありません`);
  }
  const amount = price.unit_amount;
  if (amount == null) {
    throw new Error(`price ${price.id} の unit_amount が null です`);
  }

  return {
    tier,
    cycle,
    priceId: price.id,
    amount,
    currency: price.currency,
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count,
    priceLabel: formatCurrency(amount, price.currency),
    periodLabel: formatIntervalLabel(
      price.recurring.interval,
      price.recurring.interval_count,
    ),
    note: buildNote(cycle, price, refs),
  };
}

function buildNote(
  cycle: BillingCycle,
  price: Stripe.Price,
  refs: { monthly: Stripe.Price | null; yearly: Stripe.Price | null },
): string {
  if (cycle === "monthly") {
    return "毎月自動更新。いつでも解約可能。";
  }

  const yearAmount = price.unit_amount ?? 0;
  const monthAmount = refs.monthly?.unit_amount ?? null;
  if (!monthAmount || yearAmount <= 0) {
    return "支払いは年に 1 回。途中解約は次回更新分から停止。";
  }
  const perMonth = Math.round(yearAmount / 12);
  const savedMonths = Math.max(
    0,
    Math.round((monthAmount * 12 - yearAmount) / monthAmount),
  );
  const perMonthLabel = formatCurrency(perMonth, price.currency);
  if (savedMonths > 0) {
    return `実質 ${perMonthLabel} / 月（${savedMonths} ヶ月分お得）`;
  }
  return `実質 ${perMonthLabel} / 月`;
}

function formatCurrency(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const major = isZeroDecimal ? amount : amount / 100;
  if (code === "JPY") {
    return `¥${new Intl.NumberFormat("ja-JP", {
      maximumFractionDigits: 0,
    }).format(major)}`;
  }
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: code,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(major);
}

function formatIntervalLabel(
  interval: Stripe.Price.Recurring.Interval,
  count: number,
): string {
  const unit = INTERVAL_LABEL[interval];
  return count === 1 ? unit : `${count} ${unit}`;
}

const INTERVAL_LABEL: Record<Stripe.Price.Recurring.Interval, string> = {
  day: "日",
  week: "週",
  month: "月",
  year: "年",
};

/**
 * Stripe で最小単位 = 主単位の通貨。
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
