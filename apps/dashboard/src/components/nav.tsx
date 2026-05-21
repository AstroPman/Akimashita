import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "概要" },
  { href: "/users", label: "ユーザ" },
  { href: "/tables", label: "テーブル集計" },
  { href: "/notifications", label: "通知" },
  { href: "/availability", label: "予約枠" },
  { href: "/scraper", label: "スクレイパ" },
] as const;

export function DashboardNav({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        "flex flex-col gap-1 border-r bg-sidebar text-sidebar-foreground p-4 min-w-48",
        className,
      )}
      aria-label="ダッシュボードナビゲーション"
    >
      <Link
        href="/"
        className="mb-4 text-base font-semibold tracking-tight"
      >
        Akimashita Admin
      </Link>
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        ローカル限定 / 本番Supabase直結
      </p>
    </nav>
  );
}
