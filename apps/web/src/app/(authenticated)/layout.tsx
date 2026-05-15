import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3Icon, BellIcon, LogOutIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

async function fetchUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();

  // RLS が user_id = auth.uid() で絞り込むため、where 句を明示しなくてよい。
  // head: true で行を返さず count のみ取得する。
  const [emailsRes, announcementsRes, readsRes] = await Promise.all([
    supabase
      .from("notification_emails")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    supabase
      .from("announcements")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("announcement_reads")
      .select("announcement_id", { count: "exact", head: true }),
  ]);

  const unreadEmails = emailsRes.count ?? 0;
  const totalAnnouncements = announcementsRes.count ?? 0;
  const readAnnouncements = readsRes.count ?? 0;
  // お知らせは「公開済み合計 - 自分の既読数」で未読件数を計算する
  const unreadAnnouncements = Math.max(
    0,
    totalAnnouncements - readAnnouncements,
  );
  return unreadEmails + unreadAnnouncements;
}

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const unreadCount = await fetchUnreadNotificationCount();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link
            href="/watches"
            className="flex items-center"
            aria-label="アキマシタ"
          >
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/rankings" aria-label="ランキング">
                <BarChart3Icon className="size-4" />
                <span className="hidden text-xs sm:inline">ランキング</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="relative gap-1.5"
            >
              <Link href="/notifications" aria-label="通知一覧">
                <BellIcon className="size-4" />
                {unreadCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
                    aria-label={`未読${unreadCount}件`}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/account" aria-label="アカウント設定">
                <UserIcon className="size-4" />
                <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground sm:inline">
                  {user.email}
                </span>
              </Link>
            </Button>
            <form action="/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="gap-1.5"
              >
                <LogOutIcon className="size-4" />
                <span className="hidden sm:inline">ログアウト</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
