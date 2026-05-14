import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { Button } from "@/components/ui/button";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col flex-1">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center" aria-label="アキマシタ">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="アキマシタ"
              width={700}
              height={250}
              className="h-12 w-auto"
              decoding="async"
            />
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">トップへ戻る</Link>
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <article className="prose prose-sm mx-auto w-full max-w-3xl px-4 py-12 dark:prose-invert">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
