import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRingIcon, CalendarClockIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { FeatureCard } from "@/components/landing/feature-card";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq } from "@/components/landing/faq";
import { SiteFooter } from "@/components/landing/site-footer";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/watches");
  }

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
              <Link href="/pricing">料金</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">ログイン</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-20 sm:py-28">
          <div className="flex flex-col items-center text-center">
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              お気に入りのセラピストの
              <br className="hidden sm:block" />
              空き枠を、誰よりも早く。
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              指定したセラピストの予約状況を定期的にチェックし、
              空き枠が出た瞬間にメールで通知します。
              無料プランから始めて、必要に応じてアップグレードできます。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryCta />
              <SecondaryCta />
            </div>
          </div>

          <div className="mt-20 grid gap-6 sm:grid-cols-3">
            <FeatureCard
              icon={<BellRingIcon className="size-5" />}
              title="即時通知"
              body="空き枠が出たらすぐに通知。チャンスを逃さず予約できます。"
            />
            <FeatureCard
              icon={<CalendarClockIcon className="size-5" />}
              title="日時で絞り込み"
              body="行ける日・時間帯だけを監視対象に。無駄な通知を減らせます。"
            />
            <FeatureCard
              icon={<ZapIcon className="size-5" />}
              title="自動で監視"
              body="登録するだけ。あとはサービスがあなたの代わりに見張り続けます。"
            />
          </div>
        </section>

        <HowItWorks />
        <Faq />

        <section className="mx-auto w-full max-w-3xl px-4 pb-20 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            空き枠を逃さない毎日へ
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            無料プランは登録後すぐに使い始められます。
          </p>
          <div className="mt-6 flex justify-center">
            <PrimaryCta />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
