"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/analytics/track";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = { ok: true };

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signupAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      <div className="space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <MailCheckIcon className="size-6 text-foreground" aria-hidden />
          </div>
          <h2 className="mt-3 text-base font-semibold">
            確認メールを送信しました
          </h2>
          {state.sentTo ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{state.sentTo}</span>
              {" 宛に確認メールを送信しました。"}
              <br />
              受信したメールのリンクから登録を完了してください。
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              受信したメールのリンクから登録を完了してください。
            </p>
          )}
        </div>
        <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          メールが届かない場合は、迷惑メールフォルダや別のメールフィルタ
          をご確認ください。それでも届かない場合は、入力したメールアドレ
          スに誤りがないかご確認のうえ、お手数ですがもう一度ご登録くださ
          い。
        </div>
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
          autoFocus
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {state.fieldErrors?.email?.[0] ? (
          <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">パスワード</Label>
          <span className="text-xs text-muted-foreground">8文字以上</span>
        </div>
        <InputGroup>
          <InputGroupInput
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
            data-ph-mask
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={
                showPassword ? "パスワードを非表示にする" : "パスワードを表示する"
              }
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOffIcon aria-hidden />
              ) : (
                <EyeIcon aria-hidden />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {state.fieldErrors?.password?.[0] ? (
          <p className="text-xs text-destructive">{state.fieldErrors.password[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">パスワード（確認）</Label>
        <InputGroup>
          <InputGroupInput
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            data-ph-mask
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={
                showConfirmPassword
                  ? "確認用パスワードを非表示にする"
                  : "確認用パスワードを表示する"
              }
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? (
                <EyeOffIcon aria-hidden />
              ) : (
                <EyeIcon aria-hidden />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {state.fieldErrors?.confirmPassword?.[0] ? (
          <p className="text-xs text-destructive">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-muted-foreground">
        アカウントを作成すると
        <Link
          href="/terms"
          className="mx-1 underline underline-offset-4 hover:text-foreground"
        >
          利用規約
        </Link>
        と
        <Link
          href="/privacy"
          className="mx-1 underline underline-offset-4 hover:text-foreground"
        >
          プライバシーポリシー
        </Link>
        に同意したものとみなします。
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      無料でアカウントを作成
    </Button>
  );
}
