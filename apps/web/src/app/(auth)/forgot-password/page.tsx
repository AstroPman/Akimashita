import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = {
  title: "パスワードを忘れた方",
};

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          パスワードの再設定
        </h1>
        <p className="text-sm text-muted-foreground">
          登録時のメールアドレスを入力してください。
          <br />
          再設定用のリンクをメールで送信します。
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          ログイン画面に戻る
        </Link>
      </p>
    </div>
  );
}
