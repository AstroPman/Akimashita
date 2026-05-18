import type { Metadata } from "next";
import Link from "next/link";
import { SupportedSalonsTeaser } from "@/components/landing/supported-salons";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublicSalons } from "@/lib/salons";
import { getPlanPricing } from "@/lib/stripe/pricing";
import {
  BILLING_CYCLES,
  PAID_TIERS,
  PLAN_CONFIG,
  type BillingCycle,
} from "@/lib/plans";
import { PricingPlanGrid } from "./_components/pricing-plan-grid";

export const metadata: Metadata = {
  title: "料金プラン",
  description:
    "アキマシタの料金プラン。無料・スタンダード・プレミアムの 3 段階。",
};

const REASON_MESSAGE: Record<string, string> = {
  subscription_required: "この機能を利用するには有料プランへのお申し込みが必要です。",
  watch_limit: "現在のプランの監視設定数の上限に達しています。プランをアップグレードすると追加できます。",
  ranking_locked: "ランキングはスタンダード以上のプランで閲覧できます。",
  canceled: "お申し込みはキャンセルされました。プランの比較からやり直すことができます。",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; cycle?: string }>;
}) {
  const [publicSalons, pricing, { reason, cycle: cycleParam }] = await Promise.all([
    getPublicSalons(),
    getPlanPricing(),
    searchParams,
  ]);

  const defaultCycle: BillingCycle =
    cycleParam === "yearly" ? "yearly" : "monthly";

  const reasonMessage = reason ? REASON_MESSAGE[reason] : null;

  return (
    <div className="flex flex-col flex-1">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              料金プラン
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              無料プランから始めて、必要に応じてアップグレードできます。
            </p>
          </div>

          {reasonMessage ? (
            <div className="mt-6 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
              {reasonMessage}
            </div>
          ) : null}

          <div className="mt-10">
            <SupportedSalonsTeaser count={publicSalons.length} />
          </div>

          <PricingPlanGrid
            pricing={pricing}
            tiers={[...PAID_TIERS]}
            cycles={[...BILLING_CYCLES]}
            defaultCycle={defaultCycle}
            planConfig={PLAN_CONFIG}
          />

          <div className="mt-12 rounded-xl border bg-muted/40 p-6 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">
              プラン変更・請求について
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs leading-6">
              <li>
                ・無料プランはアカウント作成後すぐにご利用いただけます。
              </li>
              <li>
                ・有料プランはお申し込み時に選択された請求サイクル（月額／年額）で自動課金されます。
              </li>
              <li>
                ・アップグレード（スタンダード→プレミアム、月額→年額）は即時切替となり、
                残期間分の差額のみが請求されます（過去の支払い分は無駄になりません）。
              </li>
              <li>
                ・ダウングレードは現在の請求期間が満了した時点で次プランへ切り替わり、
                追加の日割り課金は発生しません。
              </li>
              <li>・解約はマイページからいつでも可能です。</li>
            </ul>
            <p className="mt-4 text-xs leading-6">
              <Link
                href="/payments"
                className="font-medium text-foreground underline underline-offset-2"
              >
                お支払いに関するポリシー
              </Link>
              （返金・決済方法など）
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
