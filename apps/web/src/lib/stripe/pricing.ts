import "server-only";

import { cache } from "react";
import type Stripe from "stripe";
import { getStripe } from "./server";
import { PLANS, getPriceIdFor, type Plan } from "./config";

/**
 * 1 プラン分の表示用価格情報。料金ページや、表示価格が必要な箇所から参照する。
 *
 * - `amount` は currency の最小単位（JPY は円、USD はセント）
 * - `priceLabel` / `periodLabel` / `note` はすでに日本語化済みの表示文字列
 */
export interface PlanPricing {
  plan: Plan;
  priceId: string;
  amount: number;
  currency: string;
  interval: Stripe.Price.Recurring.Interval;
  intervalCount: number;
  priceLabel: string;
  periodLabel: string;
  note: string;
}

export type PlanPricingMap = Record<Plan, PlanPricing>;

/**
 * 料金ページなどで使う、Stripe 上の最新価格を取得する。
 * 同一リクエスト内では React の `cache` でメモ化される。
 *
 * note は月額・年額が揃っているときのみ「実質 ¥X / 月」「N ヶ月分お得」を算出する。
 */
export const getPlanPricing = cache(async (): Promise<PlanPricingMap> => {
  const stripe = getStripe();
  const prices = await Promise.all(
    PLANS.map(async (plan) => {
      const priceId = getPriceIdFor(plan);
      const price = await stripe.prices.retrieve(priceId);
      return { plan, price };
    }),
  );

  const monthly = prices.find((p) => p.plan === "monthly")?.price ?? null;
  const yearly = prices.find((p) => p.plan === "yearly")?.price ?? null;

  const result = {} as PlanPricingMap;
  for (const { plan, price } of prices) {
    result[plan] = toPlanPricing(plan, price, { monthly, yearly });
  }
  return result;
});

function toPlanPricing(
  plan: Plan,
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
    plan,
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
    note: buildNote(plan, price, refs),
  };
}

function buildNote(
  plan: Plan,
  price: Stripe.Price,
  refs: { monthly: Stripe.Price | null; yearly: Stripe.Price | null },
): string {
  if (plan === "monthly") {
    return "毎月自動更新。いつでも解約可能。";
  }

  // 年額の note は、月額が取得できているときだけ「実質 ¥X / 月（N ヶ月分お得）」を算出する。
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
  // JPY のように最小単位 = 主単位の通貨はそのまま。USD/EUR などは 100 で割る。
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const major = isZeroDecimal ? amount : amount / 100;
  // JPY は Intl だと環境（ICU）依存で「￥」(全角) になるため、半角 ¥ で固定する。
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
 * 必要に応じて追加する。
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
