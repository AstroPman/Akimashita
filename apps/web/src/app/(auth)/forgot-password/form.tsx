"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = { ok: true };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);

  useEffect(() => {
    if (!state.ok && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state]);

  if (state.ok && state.emailSent) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-card-foreground">
        <h2 className="text-base font-semibold">メールを送信しました</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          入力されたメールアドレスにアカウントが存在する場合、パスワード再設定用のリンクを送信します。
          受信したメールのリンクから新しいパスワードを設定してください。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {state.fieldErrors?.email?.[0] ? (
          <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      リセットメールを送信
    </Button>
  );
}
