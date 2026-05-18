import Image from "next/image";
import { FeatureCard } from "@/components/landing/feature-card";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq } from "@/components/landing/faq";
import { SiteFooter } from "@/components/landing/site-footer";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";
import { PublicSiteHeader } from "@/components/public-site-header";

/** ログイン済みの `/` は middleware で `/watches` にリダイレクト（二重の getUser を避ける） */
export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <PublicSiteHeader logoPriority bordered={false} />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            <Image
              src="/landing/hero-bg-wave.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" />
          </div>

          <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:pb-28 sm:pt-14">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/landing/hero-clock.png"
                alt=""
                width={1024}
                height={1024}
                priority
                sizes="(min-width: 640px) 320px, 240px"
                className="h-auto w-60 sm:w-80"
              />

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
                お気に入りのセラピストの
                <br />
                空き枠を、誰よりも早く。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-700 sm:text-base">
                指定したセラピストの予約状況を定期的にチェックし、
                <br className="hidden sm:block" />
                空き枠が出た瞬間にメールで通知します。
                <br className="hidden sm:block" />
                無料プランから始めて、必要に応じてアップグレードできます。
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <PrimaryCta />
                <SecondaryCta />
              </div>
            </div>
          </div>
        </section>

        <HowItWorks />

        <section
          aria-labelledby="landing-features-heading"
          className="mx-auto w-full max-w-5xl px-4 pb-16 sm:pb-24"
        >
          <h2 id="landing-features-heading" className="sr-only">
            主な機能
          </h2>
          <div className="grid gap-10 sm:grid-cols-3 sm:gap-6">
            <FeatureCard
              icon={
                <Image
                  src="/landing/icon-bell.png"
                  alt=""
                  width={1536}
                  height={1024}
                  sizes="80px"
                />
              }
              title="即時通知"
              body="アカウントを定期巡回し、希望日を見ながら比べやすくします。"
            />
            <FeatureCard
              icon={
                <Image
                  src="/landing/icon-clock.png"
                  alt=""
                  width={1536}
                  height={1024}
                  sizes="80px"
                />
              }
              title="日時で絞り込み"
              body="対応サロンの中から、希望日・時間帯を登録します。"
            />
            <FeatureCard
              icon={
                <Image
                  src="/landing/icon-zap.png"
                  alt=""
                  width={1536}
                  height={1024}
                  sizes="80px"
                />
              }
              title="自動で監視"
              body="予約サイトを定期巡回し、空き枠ページで登録します。"
            />
          </div>
        </section>

        <Faq />

        <section className="mx-auto w-full max-w-3xl px-4 pb-20 text-center">
          <div className="mt-6 flex justify-center">
            <PrimaryCta className="min-w-[280px]" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
