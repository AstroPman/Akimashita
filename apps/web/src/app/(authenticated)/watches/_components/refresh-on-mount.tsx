"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * ページがマウントされたタイミングと BFCache から復元されたタイミングで
 * `router.refresh()` を呼び、Server Component を最新の DB 状態で再フェッチさせる。
 *
 * - 通常マウント: SSR 直後にも 1 回走るが、availability 等は外部書き込みで
 *   ページ滞在中に変化し得るため、開いた瞬間の鮮度を保証することを優先する。
 * - BFCache 復元: `useEffect` は再実行されないため、`pageshow` の
 *   `event.persisted` を見て補足する。
 */
export function RefreshOnMount() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  return null;
}
