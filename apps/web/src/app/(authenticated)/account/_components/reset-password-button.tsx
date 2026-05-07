"use client";

import { useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendPasswordResetEmailAction } from "../actions";

export function ResetPasswordButton() {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await sendPasswordResetEmailAction();
      if (result.ok) {
        toast.success(
          "パスワードリセット用のメールを送信しました。受信したメールのリンクから新しいパスワードを設定してください。",
        );
      } else {
        toast.error(result.message ?? "リセットメールの送信に失敗しました");
      }
    });
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      リセットメールを送信
    </Button>
  );
}
