import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4">
          <Link
            href="/"
            className="flex items-center"
            aria-label="アキマシタ"
          >
            <BrandLogo />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
