"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/analytics/track";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = { ok: true };

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signupAction, initialState);
  // signup_complete は確認メール画面 (emailSent=true) に切り替わった最初の
  // レンダリングで1回だけ発火させたいので、ref で重複防止する。
  const trackedComplete = useRef(false);

  useEffect(() => {
    if (!state.ok && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
    if (!trackedComplete.current && state.ok && state.emailSent) {
      trackedComplete.current = true;
      track("signup_complete");
    }
  }, [state]);

  if (state.ok && state.emailSent) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-card-foreground">
        <h2 className="text-base font-semibold">確認メールを送信しました</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          受信したメールのリンクから登録を完了してください。
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => track("signup_submit")}
      className="space-y-4"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
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

      <div className="space-y-2">
        <Label htmlFor="password">パスワード（8文字以上）</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        {state.fieldErrors?.password?.[0] ? (
          <p className="text-xs text-destructive">{state.fieldErrors.password[0]}</p>
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
      アカウントを作成
    </Button>
  );
}
