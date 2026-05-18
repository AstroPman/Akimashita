import Link from "next/link";
import {
  BarChart3Icon,
  BellIcon,
  LogOutIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadNotificationCount } from "@/lib/notifications";

type Props = {
  /** ブランドロゴを LCP として優先読み込みする (主にトップページ用)。 */
  logoPriority?: boolean;
  /**
   * border-b の有無。トップページのようにヒーロー画像と接続したい
   * 場合は false にしてボーダーを描かない。
   */
  bordered?: boolean;
};

/**
 * サイト共通ヘッダ。
 *
 * Supabase のセッションを参照し、ログイン状態に応じて表示するメニューを切り替える。
 *
 * - 未ログイン: 検索 / 料金 / ログイン
 * - ログイン中: 検索 / ランキング / 通知（未読バッジ）/ マイページ / ログアウト
 *
 * 公開ページ・認証必須ページのどちらからも使い、ヘッダ表示を 1 箇所に集約する。
 */
export async function SiteHeader({
  logoPriority = false,
  bordered = true,
}: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const unreadCount = user ? await fetchUnreadNotificationCount() : 0;

  return (
    <header
      className={bordered ? "border-b" : "relative z-20"}
      aria-label="サイトナビゲーション"
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <Link
          href={user ? "/watches" : "/"}
          className="flex items-center"
          aria-label="アキマシタ"
        >
          <BrandLogo priority={logoPriority} />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="min-h-12 gap-1.5 px-3"
          >
            <Link href="/salons" aria-label="サロン・セラピストを検索">
              <SearchIcon className="size-4" aria-hidden />
              <span className="hidden text-xs sm:inline">検索</span>
            </Link>
          </Button>

          {user ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-12 gap-1.5 px-3"
              >
                <Link href="/rankings" aria-label="ランキング">
                  <BarChart3Icon className="size-4" aria-hidden />
                  <span className="hidden text-xs sm:inline">ランキング</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="relative min-h-12 gap-1.5 px-3"
              >
                <Link href="/notifications" aria-label="通知一覧">
                  <BellIcon className="size-4" aria-hidden />
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
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-12 gap-1.5 px-3"
              >
                <Link href="/account" aria-label="アカウント設定">
                  <UserIcon className="size-4" aria-hidden />
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
                  className="min-h-12 gap-1.5 px-3"
                >
                  <LogOutIcon className="size-4" aria-hidden />
                  <span className="hidden text-xs sm:inline">ログアウト</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-12 min-w-12 px-3 sm:min-w-0"
              >
                <Link href="/pricing">料金</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="min-h-12 min-w-12 px-3 sm:min-w-0"
              >
                <Link href="/login">ログイン</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
