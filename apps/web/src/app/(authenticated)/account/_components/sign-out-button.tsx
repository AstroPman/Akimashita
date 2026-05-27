"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOutIcon className="size-4" aria-hidden />
      )}
      {pending ? "ログアウト中…" : "ログアウト"}
    </Button>
  );
}

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <SubmitButton />
    </form>
  );
}
