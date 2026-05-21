/**
 * PostHog への計測呼び出しを集約するラッパー。
 *
 * - クライアントサイド専用 (posthog-js は window 依存)。SSR からの呼び出しは no-op
 * - PostHog の初期化 (`NEXT_PUBLIC_POSTHOG_KEY` 未設定) されていなければ no-op
 * - イベント名・プロパティの型は {@link EventProps} で集中管理し、誤呼び出しを
 *   型エラーで検出する
 */
"use client";

import posthog from "posthog-js";
import type { AppEventName, EventProps } from "./events";

function isReady(): boolean {
  if (typeof window === "undefined") return false;
  // posthog-js 1.x は `__loaded` フラグで初期化済みかを判定できる。
  const ph = posthog as unknown as { __loaded?: boolean };
  return Boolean(ph.__loaded);
}

export function track<E extends AppEventName>(
  event: E,
  ...args: EventProps[E] extends Record<string, never>
    ? []
    : [props: EventProps[E]]
): void {
  if (!isReady()) return;
  const props = args[0];
  try {
    posthog.capture(event, props);
  } catch (err) {
    console.warn("[analytics] track failed:", event, err);
  }
}

/** 認証済みユーザを PostHog に紐付ける (匿名イベントの統合)。 */
export function identifyUser(userId: string): void {
  if (!isReady()) return;
  try {
    // PII を渡さないため email 等は意図的に含めない。
    posthog.identify(userId);
  } catch (err) {
    console.warn("[analytics] identify failed:", err);
  }
}

/** ログアウト等で識別を解除する。 */
export function resetUser(): void {
  if (!isReady()) return;
  try {
    posthog.reset();
  } catch (err) {
    console.warn("[analytics] reset failed:", err);
  }
}

/** ルート遷移時の手動 `$pageview` 発火 (Provider から呼ぶ)。 */
export function capturePageview(url: string): void {
  if (!isReady()) return;
  try {
    posthog.capture("$pageview", { $current_url: url });
  } catch (err) {
    console.warn("[analytics] pageview failed:", err);
  }
}
