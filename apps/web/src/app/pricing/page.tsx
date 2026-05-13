import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatsIndicator } from "@/components/landing/seats-indicator";
import { SupportedSalonsTeaser } from "@/components/landing/supported-salons";
import { SiteFooter } from "@/components/landing/site-footer";
import { getPublicSalons } from "@/lib/salons";
import { getSeatsSnapshot } from "@/lib/seats";
import { TRIAL_DAYS } from "@/lib/stripe/config";
import { getPlanPricing } from "@/lib/stripe/pricing";
import { startCheckoutAction } from "./actions";

export const metadata: Metadata = {
  title: "料金プラン",
  description:
    "アキマシタは限定 N 名のサービスです。月額 / 年額プランから選択でき、最初の14日間は無料です。",
};

interface PlanCardMeta {
  id: "monthly" | "yearly";
  name: string;
  bullets: string[];
  highlight?: boolean;
}

const PLAN_META: PlanCardMeta[] = [
  {
    id: "monthly",
    name: "月額プラン",
    bullets: [
      "監視できるセラピストの登録は無制限",
      "メール通知（LINE 通知は今後対応予定）",
      "希望日・時間帯による絞り込み",
    ],
  },
  {
    id: "yearly",
    name: "年額プラン",
    bullets: [
      "月額プランの全機能",
      "支払いは年に 1 回",
      "途中解約は次回更新分から停止",
    ],
    highlight: true,
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; invite?: string }>;
}) {
  const [seats, publicSalons, pricing, { reason, invite }] = await Promise.all([
    getSeatsSnapshot(),
    getPublicSalons(),
    getPlanPricing(),
    searchParams,
  ]);
  const inviteToken = invite ?? null;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="アキマシタ">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="アキマシタ" className="h-12 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">ログイン</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              料金プラン
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              通知の価値を保つため、登録は限定 {seats.max} 名のサービスです。
              いずれのプランも最初の {TRIAL_DAYS} 日間は無料でお試しいただけます。
              トライアル開始時にお支払い情報のご登録が必要です。
            </p>
          </div>

          <div className="mt-8">
            <SeatsIndicator variant="card" />
          </div>

          {reason === "full" ? (
            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              現在は満員のためお申込みを受け付けていません。空きが出次第ご案内する{" "}
              <Link
                href="/waitlist"
                className="font-medium underline underline-offset-4"
              >
                ウェイトリスト
              </Link>
              にご登録ください。
            </div>
          ) : null}

          {inviteToken ? (
            <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              ご招待ありがとうございます。下記のプランからご利用を開始いただけます。
            </div>
          ) : null}

          <div className="mt-10">
            <SupportedSalonsTeaser count={publicSalons.length} />
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {PLAN_META.map((plan) => {
              const price = pricing[plan.id];
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-xl border bg-card p-6 text-card-foreground shadow-sm ${plan.highlight ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    {plan.highlight ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        おすすめ
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight">
                      {price.priceLabel}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {price.periodLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {price.note}
                  </p>

                  <ul className="mt-6 space-y-2 text-sm">
                    {plan.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <form action={startCheckoutAction} className="mt-6">
                    <input type="hidden" name="plan" value={plan.id} />
                    {inviteToken ? (
                      <input type="hidden" name="invite" value={inviteToken} />
                    ) : null}
                    {seats.isFull && !inviteToken ? (
                      <Button
                        asChild
                        className="w-full"
                        variant="outline"
                        size="lg"
                      >
                        <Link href="/waitlist">ウェイトリストに登録</Link>
                      </Button>
                    ) : (
                      <Button type="submit" className="w-full" size="lg">
                        {TRIAL_DAYS} 日間無料で試す
                      </Button>
                    )}
                  </form>
                </div>
              );
            })}
          </div>

          <div className="mt-12 rounded-xl border bg-muted/40 p-6 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">
              トライアルと請求について
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs leading-6">
              <li>
                ・お申し込み時にお支払い情報をご登録いただきます。{TRIAL_DAYS}
                日間は料金が発生しません。
              </li>
              <li>
                ・{TRIAL_DAYS}{" "}
                日経過後に選択されたプランの金額が自動課金されます。
              </li>
              <li>・解約はマイページからいつでも可能です。</li>
              <li>
                ・解約後も、すでに支払済みの期間（次回請求日まで）は引き続きご利用いただけます。
              </li>
            </ul>
            <p className="mt-4 text-xs leading-6">
              <Link href="/payments" className="font-medium text-foreground underline underline-offset-2">
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
