"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { markAnnouncementRead, markEmailRead } from "../actions";

interface Props {
  kind: "email" | "announcement";
  id: string;
}

export function AutoMarkRead({ kind, id }: Props) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const run = async () => {
      const res =
        kind === "email"
          ? await markEmailRead({ id })
          : await markAnnouncementRead({ id });
      if (!res.ok) {
        toast.error(res.message);
      }
    };

    void run();
  }, [kind, id]);

  return null;
}
