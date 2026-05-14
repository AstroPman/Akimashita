"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURE_LABELS,
  type BillingCycle,
  type PaidTier,
  type PlanConfig,
  type PlanTier,
} from "@/lib/plans";
import type { PlanPricingMap } from "@/lib/stripe/pricing";
import { startCheckoutAction } from "../actions";

const HIGHLIGHT_TIER: PaidTier = "premium";

export function PricingPlanGrid(props: {
  pricing: PlanPricingMap;
  tiers: PaidTier[];
  cycles: BillingCycle[];
  defaultCycle: BillingCycle;
  planConfig: Record<PlanTier, PlanConfig>;
  trialDays: number;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(props.defaultCycle);

  return (
    <div className="mt-10 space-y-6">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border bg-muted/40 p-1 text-sm">
          {props.cycles.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-full px-4 py-1.5 transition-colors ${
                cycle === c
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={cycle === c}
            >
              {c === "monthly" ? "月額" : "年額"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FreeCard config={props.planConfig.free} />
        {props.tiers.map((tier) => {
          const price = props.pricing[tier]?.[cycle];
          if (!price) return null;
          return (
            <PaidCard
              key={tier}
              tier={tier}
              cycle={cycle}
              config={props.planConfig[tier]}
              priceLabel={price.priceLabel}
              periodLabel={price.periodLabel}
              note={price.note}
              trialDays={props.trialDays}
              highlight={tier === HIGHLIGHT_TIER}
            />
          );
        })}
      </div>
    </div>
  );
}

function FreeCard({ config }: { config: PlanConfig }) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-lg font-semibold">{config.label}</h2>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">¥0</span>
        <span className="text-sm text-muted-foreground">/ 月</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        アカウント登録のみで利用可能。
      </p>
      <PlanFeatureList config={config} />
      <div className="mt-6">
        <Button asChild variant="outline" className="w-full" size="lg">
          <Link href="/signup">無料で始める</Link>
        </Button>
      </div>
    </div>
  );
}

function PaidCard(props: {
  tier: PaidTier;
  cycle: BillingCycle;
  config: PlanConfig;
  priceLabel: string;
  periodLabel: string;
  note: string;
  trialDays: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-sm ${
        props.highlight ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{props.config.label}</h2>
        {props.highlight ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            おすすめ
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">
          {props.priceLabel}
        </span>
        <span className="text-sm text-muted-foreground">
          / {props.periodLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{props.note}</p>

      <PlanFeatureList config={props.config} />

      <form action={startCheckoutAction} className="mt-6">
        <input type="hidden" name="tier" value={props.tier} />
        <input type="hidden" name="cycle" value={props.cycle} />
        <Button type="submit" className="w-full" size="lg">
          {props.trialDays} 日間無料で試す
        </Button>
      </form>
    </div>
  );
}

function PlanFeatureList({ config }: { config: PlanConfig }) {
  return (
    <ul className="mt-6 space-y-2 text-sm">
      {PLAN_FEATURE_KEYS.map((key) => {
        const feature = config.features[key];
        const label = PLAN_FEATURE_LABELS[key];
        return (
          <li
            key={key}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              {feature.available ? (
                <CheckIcon
                  className="size-4 shrink-0 text-primary"
                  aria-label="利用可能"
                />
              ) : (
                <XIcon
                  className="size-4 shrink-0 text-muted-foreground/70"
                  aria-label="利用不可"
                />
              )}
              <span
                className={
                  feature.available ? "" : "text-muted-foreground"
                }
              >
                {label}
              </span>
            </span>
            {feature.value ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {feature.value}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
