"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWaitlistAction, type WaitlistState } from "./actions";

const initialState: WaitlistState = { ok: true };

export function WaitlistForm() {
  const [state, formAction] = useActionState(joinWaitlistAction, initialState);

  useEffect(() => {
    if (!state.ok && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state]);

  if (state.ok && state.registered) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-card-foreground">
        <h2 className="text-base font-semibold">ウェイトリストに登録しました</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          席が空き次第、ご登録のメールアドレスへご案内いたします。
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
      ウェイトリストに登録
    </Button>
  );
}
