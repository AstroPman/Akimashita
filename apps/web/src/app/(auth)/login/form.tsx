"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2Icon, MailWarningIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loginAction,
  resendConfirmationAction,
  type LoginState,
  type ResendConfirmationState,
} from "./actions";

const initialState: LoginState = { ok: true };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (!state.ok && state.message && !state.fieldErrors && !state.needsEmailConfirmation) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <div className="space-y-4">
      {!state.ok && state.needsEmailConfirmation && state.email ? (
        <EmailConfirmationAlert email={state.email} redirectTo={redirectTo} />
      ) : null}

      <form action={formAction} className="space-y-4">
        {redirectTo ? (
          <input type="hidden" name="redirect" value={redirectTo} />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.email)}
            defaultValue={state.email ?? undefined}
          />
          {state.fieldErrors?.email?.[0] ? (
            <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          {state.fieldErrors?.password?.[0] ? (
            <p className="text-xs text-destructive">{state.fieldErrors.password[0]}</p>
          ) : null}
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      ログイン
    </Button>
  );
}

const resendInitialState: ResendConfirmationState = { ok: true };

function EmailConfirmationAlert({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(
    resendConfirmationAction,
    resendInitialState,
  );

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
    } else if (!state.ok && state.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <MailWarningIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-semibold">メール認証が完了していません</p>
          <p className="text-xs leading-relaxed">
            <span className="font-medium">{email}</span>{" "}
            宛に送信した確認メール内のリンクから登録を完了してください。メールが届いていない場合は再送できます。
          </p>
          <form action={formAction} className="pt-1">
            <input type="hidden" name="email" value={email} />
            {redirectTo ? (
              <input type="hidden" name="redirect" value={redirectTo} />
            ) : null}
            <ResendButton />
          </form>
        </div>
      </div>
    </div>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-900/60 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/40"
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      確認メールを再送する
    </Button>
  );
}
