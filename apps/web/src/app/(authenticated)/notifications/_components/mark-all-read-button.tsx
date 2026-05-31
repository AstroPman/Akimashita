"use client";

import { CheckCheckIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAllRead } from "../actions";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const res = await markAllRead();
      if (res.ok) {
        toast.success("すべての通知を既読にしました");
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled || isPending}
      className="gap-1"
    >
      <CheckCheckIcon className="size-4" />
      {isPending ? "既読にしています…" : "全て既読にする"}
    </Button>
  );
}
