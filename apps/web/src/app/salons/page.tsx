import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { SupportedSalonsList } from "@/components/landing/supported-salons";
import { SiteFooter } from "@/components/landing/site-footer";
import { getPublicSalons } from "@/lib/salons";

export const metadata: Metadata = {
  title: "対応サロン一覧",
  description:
    "アキマシタで空き通知を利用できる対応サロンの一覧です。お申し込み前にご確認ください。",
};

export default async function SalonsPage() {
  const salons = await getPublicSalons();

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="アキマシタ">
            <BrandLogo />
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
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              対応サロン一覧
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              セラピストの空き通知をご利用いただけるサロンです。
              ご自身が通われている店舗が含まれているか、お申し込み前にご確認ください。
            </p>
          </div>

          <div className="mt-10">
            <SupportedSalonsList salons={salons} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
