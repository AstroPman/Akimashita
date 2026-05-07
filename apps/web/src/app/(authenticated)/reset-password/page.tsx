import type { Metadata } from "next";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = {
  title: "パスワードの再設定",
};

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          新しいパスワードを設定
        </h1>
        <p className="text-sm text-muted-foreground">
          新しいパスワードを入力して更新してください。
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
