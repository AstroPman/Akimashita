"use client";

import Link from "next/link";
import { CalendarClockIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatJstDateTime } from "@/lib/date";
import {
  CYCLE_LABEL,
  PLAN_CONFIG,
  type BillingCycle,
  type PlanTier,
} from "@/lib/plans";
import { track } from "@/lib/analytics/track";
import { openCustomerPortalAction } from "../actions";

export interface BillingViewProps {
  /** users.plan_tier。アプリの権限判定で使う実プラン。 */
  planTier: PlanTier;
  /** 直近の Stripe Subscription の状態。未契約のときは null。 */
  status: string | null;
  /** Stripe subscription に紐づく tier（standard / premium）。 */
  tier: PlanTier | null;
  /** Stripe subscription に紐づく billing_cycle。 */
  cycle: BillingCycle | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "トライアル中",
  active: "ご利用中",
  past_due: "支払いが滞っています",
  unpaid: "支払い未完了",
  canceled: "解約済み",
  incomplete: "登録未完了",
  incomplete_expired: "登録期限切れ",
  paused: "一時停止中",
};

export function BillingCard(props: BillingViewProps) {
  const statusLabel = props.status
    ? (STATUS_LABEL[props.status] ?? props.status)
    : "未契約（無料プラン）";

  const planLabel = props.tier && props.cycle
    ? `${PLAN_CONFIG[props.tier].label} / ${CYCLE_LABEL[props.cycle]}`
    : PLAN_CONFIG[props.planTier].label;

  const trialDaysLeft = countDaysLeft(props.trialEnd);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ご契約</CardTitle>
        <CardDescription>
          現在のプラン状況を確認したり、お支払い情報の変更・解約ができます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6">
          <dt className="text-muted-foreground">状態</dt>
          <dd>{statusLabel}</dd>

          <dt className="text-muted-foreground">プラン</dt>
          <dd>{planLabel}</dd>

          {props.status === "trialing" && trialDaysLeft !== null ? (
            <>
              <dt className="text-muted-foreground">トライアル残り</dt>
              <dd className="inline-flex items-center gap-1.5">
                <CalendarClockIcon className="size-4 text-muted-foreground" />
                <span>
                  あと {trialDaysLeft} 日（{formatJstDateTime(props.trialEnd!)} まで無料）
                </span>
              </dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">次回請求日</dt>
          <dd>
            {props.currentPeriodEnd
              ? formatJstDateTime(props.currentPeriodEnd)
              : "—"}
          </dd>

          {props.cancelAtPeriodEnd ? (
            <>
              <dt className="text-muted-foreground">解約予約</dt>
              <dd className="text-destructive">
                次回請求日以降は更新されません
              </dd>
            </>
          ) : null}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant={props.hasStripeCustomer ? "outline" : "default"}>
            <Link href="/pricing">
              {props.planTier === "premium" ? "プランを比較" : "プランをアップグレード"}
            </Link>
          </Button>
          {props.hasStripeCustomer ? (
            <form
              action={openCustomerPortalAction}
              onSubmit={() => track("billing_portal_opened")}
            >
              <Button type="submit" variant="outline" className="gap-1.5">
                <ExternalLinkIcon className="size-4" />
                お支払い・解約を管理
              </Button>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function countDaysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
