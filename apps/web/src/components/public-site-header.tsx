import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

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
 * 公開ページ共通ヘッダ。
 * 「検索 / 料金 / ログイン」の 3 メニューを並べる。
 *
 * `/`、`/pricing`、`/salons`、`/salons/[id]`、`/salons/[id]/therapists/[id]`
 * といった未ログイン導線で共通利用する。認証必須ルートでは
 * `(authenticated)/layout.tsx` 側の専用ヘッダを使うので、こちらは
 * ログイン済みかどうかを意識しない。
 */
export function PublicSiteHeader({
  logoPriority = false,
  bordered = true,
}: Props) {
  return (
    <header
      className={bordered ? "border-b" : "relative z-20"}
      aria-label="サイトナビゲーション"
    >
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center" aria-label="アキマシタ">
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
              <span>検索</span>
            </Link>
          </Button>
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
        </nav>
      </div>
    </header>
  );
}
