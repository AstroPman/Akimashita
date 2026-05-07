import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "ログイン",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">ログイン</h1>
        <p className="text-sm text-muted-foreground">
          アカウントをお持ちでない方は
          <Link
            href="/signup"
            className="ml-1 font-medium text-foreground underline underline-offset-4"
          >
            新規登録
          </Link>
        </p>
      </div>
      <LoginForm redirectTo={redirect} />
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline underline-offset-4"
        >
          パスワードを忘れた方はこちら
        </Link>
      </p>
    </div>
  );
}
