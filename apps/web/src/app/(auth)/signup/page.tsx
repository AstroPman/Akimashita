import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./form";

export const metadata: Metadata = {
  title: "新規登録",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const loginHref = next
    ? `/login?redirect=${encodeURIComponent(next)}`
    : "/login";

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">新規登録</h1>
        <p className="text-sm text-muted-foreground">
          すでにアカウントをお持ちの方は
          <Link
            href={loginHref}
            className="ml-1 font-medium text-foreground underline underline-offset-4"
          >
            ログイン
          </Link>
        </p>
      </div>
      <SignupForm next={next} />
    </div>
  );
}
