"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateEmailAction,
  type AccountActionState,
} from "../actions";

const initialState: AccountActionState = { ok: true };

export function UpdateEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(updateEmailAction, initialState);

  useEffect(() => {
    if (!state.ok && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
    if (state.ok && state.done === "email_sent") {
      toast.success("確認メールを送信しました。新しいメールアドレスのリンクから変更を完了してください。");
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-email">現在のメールアドレス</Label>
        <Input
          id="current-email"
          type="email"
          value={currentEmail}
          disabled
          readOnly
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">新しいメールアドレス</Label>
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
        <p className="text-xs text-muted-foreground">
          変更するには新しいメールアドレスに送信される確認メールのリンクをクリックしてください。
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
      確認メールを送信
    </Button>
  );
}
