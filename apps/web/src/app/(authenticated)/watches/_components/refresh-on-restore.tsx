"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * BFCache から復元されたタイミングでのみ `router.refresh()` を呼び、
 * Server Component を最新の DB 状態で再フェッチさせる。
 *
 * - 通常マウント時は SSR で出した直後の DOM が最新と同等のため、再度の
 *   refresh は行わない (Server Action 後の鮮度は `revalidatePath` 側で
 *   担保している)。
 * - BFCache 復元時は `useEffect` が再実行されないため、`pageshow` の
 *   `event.persisted` を監視して補足する。
 */
export function RefreshOnRestore() {
  const router = useRouter();

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
