"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { capturePageview, identifyUser, resetUser } from "@/lib/analytics/track";

/**
 * PostHog のクライアント初期化 + ルート遷移時の `$pageview` 発火 +
 * Supabase 認証状態と PostHog identify を同期する Provider。
 *
 * `NEXT_PUBLIC_POSTHOG_KEY` が未設定の環境では何もしない (no-op) ため、
 * 本番以外で安全にビルドできる。
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  // Layout レベルで `useSearchParams` を呼ぶと全ページが dynamic rendering に
  // 落ちてしまうため、クエリ文字列は window.location.search を直接参照する。
  const pathname = usePathname();

  // 初期化: ページの最初の hydrate でのみ走る。
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    if (!key) return;

    const alreadyLoaded = (posthog as unknown as { __loaded?: boolean })
      .__loaded;
    if (alreadyLoaded) return;

    posthog.init(key, {
      api_host: host,
      // App Router では SPA 遷移を posthog-js が検出できないため自前で発火。
      capture_pageview: false,
      capture_pageleave: true,
      // 匿名ユーザの person profile を作らずコストを抑える。
      // identify() 呼び出し後にのみ person profile を生成する。
      person_profiles: "identified_only",
      // 全クリック自動取得は OFF。明示 track のみに絞ってデータを綺麗に保つ。
      autocapture: false,
      // 初期フェーズはセッションリプレイで定性観察したいので有効化。
      // パスワード入力等は posthog-js のデフォルトでマスクされる。
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: false,
        maskTextSelector: "[data-ph-mask]",
      },
      // 開発時のログは抑制。
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") {
          ph.debug(false);
        }
      },
    });
  }, []);

  // ルート遷移を捕捉して $pageview を手動発火。
  useEffect(() => {
    if (!pathname) return;
    if (typeof window === "undefined") return;
    capturePageview(window.location.href);
  }, [pathname]);

  // 認証状態と PostHog identify を同期。
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const supabase = createClient();

    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const userId = data.session?.user.id;
      if (userId) identifyUser(userId);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        resetUser();
        return;
      }
      const userId = session?.user.id;
      if (userId) identifyUser(userId);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
