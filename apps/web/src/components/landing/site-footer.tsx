import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { NotificationTimingDisclaimer } from "@/components/notification-timing-disclaimer";

const FOOTER_LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/#features", label: "予約通知" },
  { href: "/pricing", label: "料金" },
  { href: "/salons", label: "対応サロン" },
  { href: "/contact", label: "お問い合わせ" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-background/90 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <Link href="/" className="flex items-center" aria-label="アキマシタ">
            <BrandLogo />
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {FOOTER_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <Link href="/terms" className="transition-colors hover:text-foreground">
              利用規約
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              プライバシー
            </Link>
            <Link href="/payments" className="transition-colors hover:text-foreground">
              お支払い
            </Link>
          </nav>
        </div>
        <div className="mt-10 border-t pt-8">
          <NotificationTimingDisclaimer className="mx-auto max-w-3xl text-center sm:text-left" />
          <p className="mt-6 text-center text-xs text-muted-foreground sm:text-left">
            &copy; {new Date().getFullYear()} アキマシタ
          </p>
        </div>
      </div>
    </footer>
  );
}
