import Image from "next/image";
import { FeatureCard } from "@/components/landing/feature-card";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq } from "@/components/landing/faq";
import { SiteFooter } from "@/components/landing/site-footer";
import { PrimaryCta, SecondaryCta } from "@/components/landing/cta";
import { ScaleStats } from "@/components/landing/scale-stats";
import { SiteHeader } from "@/components/site-header";
import { getPublicStats } from "@/lib/salons";

export default async function Home() {
  // 対応規模セクション用に「公開サロン数」「在籍セラピスト合計」を SSR で算出。
  // 取得に失敗した場合は内部でゼロが返るため、ゼロのときはセクションが
  // 非表示になる (ScaleStats 側でガード)。
  const { salonCount, therapistCount } = await getPublicStats();
  return (
    <div className="flex flex-col flex-1">
      <SiteHeader logoPriority bordered={false} />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            <Image
              src="/landing/hero-bg-wave.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
          </div>

          <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:pb-28 sm:pt-14">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/landing/hero-clock.webp"
                alt=""
                width={1024}
                height={1024}
                priority
                sizes="(min-width: 640px) 320px, 240px"
                className="h-auto w-60 sm:w-80"
              />

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                お気に入りのセラピストの
                <br />
                空き枠を、誰よりも早く。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-foreground/80 sm:text-base">
                予約サイトを 1 分間隔で監視し、
                <br className="hidden sm:block" />
                空きが出た瞬間にメールでお知らせします。
                <br className="hidden sm:block" />
                クレジットカード登録不要、無料プランから始められます。
              </p>
              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
                <PrimaryCta />
                <SecondaryCta />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                クレカ不要・1 分で登録完了
              </p>
            </div>
          </div>
        </section>

        <ScaleStats
          salonCount={salonCount}
          therapistCount={therapistCount}
        />

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
                  src="/landing/icon-bell.webp"
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
                  src="/landing/icon-clock.webp"
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
                  src="/landing/icon-zap.webp"
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
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta className="min-w-[260px]" />
            <SecondaryCta className="min-w-[260px]" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            クレカ不要・1 分で登録完了
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
