import type { Metadata } from "next";
import Link from "next/link";
import { SeatsIndicator } from "@/components/landing/seats-indicator";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "./form";

export const metadata: Metadata = {
  title: "ウェイトリスト登録",
  description:
    "アキマシタは限定サービスです。満員のため新規受付を一時停止しています。空きが出次第ご案内します。",
};

export default function WaitlistPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <Link
          href="/"
          className="inline-flex items-center"
          aria-label="アキマシタ"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="アキマシタ" className="h-12 w-auto" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          ウェイトリスト登録
        </h1>
        <p className="text-sm text-muted-foreground">
          通知の価値を保つため登録は限定です。空きが出次第、メールでご案内します。
        </p>
      </header>

      <SeatsIndicator variant="card" />

      <WaitlistForm />

      <p className="text-center text-xs text-muted-foreground">
        既にアカウントをお持ちの方は
        <Button asChild variant="link" className="h-auto px-1 py-0 text-xs">
          <Link href="/login">ログイン</Link>
        </Button>
      </p>
    </div>
  );
}
