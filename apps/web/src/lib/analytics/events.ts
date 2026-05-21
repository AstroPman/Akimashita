/**
 * プロダクトファネル計測用のイベント定義。
 *
 * - イベント名は snake_case で「名詞_動詞」の順 (PostHog 文化に合わせる)
 * - PostHog の `$pageview` は Provider で自動発火するので、ここでは
 *   「ページ遷移では取れない、意図的なユーザアクション」だけを定義する
 * - プロパティのキー・値の型は `as const` で固定し、`track()` が型エラーで
 *   未定義のイベントや誤ったプロパティを弾けるようにする
 *
 * 解約完了 (`subscription_canceled`) は Stripe Customer Portal 上で行われ、
 * 解約成立の正確なシグナルは Webhook 経由でしか得られないため、ここでは
 * Portal を開いた段階を `billing_portal_opened` として記録する。
 */
import type { BillingCycle, PaidTier } from "@/lib/plans";

export type EventProps = {
  /** 料金カードの「このプランで始める」をクリック。 */
  pricing_cta_click: {
    tier: PaidTier;
    cycle: BillingCycle;
  };
  /** 月額 / 年額の切替トグルを押した。 */
  pricing_cycle_toggled: {
    cycle: BillingCycle;
  };
  /** signup フォームを送信した瞬間 (Server Action 発火直前)。 */
  signup_submit: Record<string, never>;
  /**
   * アカウント作成リクエストが受理された瞬間。
   * メール確認フローの場合は「確認メール送信完了」、即時セッション発行の場合は
   * リダイレクト先で発火する。「ユーザが実際にログイン可能になったか」とは別。
   */
  signup_complete: Record<string, never>;
  /** 監視 (watch_settings) を新規作成した瞬間。 */
  watch_created: {
    salon_id: string;
    therapist_id: string;
  };
  /**
   * Stripe Checkout への遷移を開始した瞬間。
   * ユーザ起点のクリックから Server Action が走るまでの間に発火する。
   */
  checkout_started: {
    tier: PaidTier;
    cycle: BillingCycle;
  };
  /** Stripe Checkout 成立後、サクセス導線に到達した瞬間。 */
  checkout_completed: {
    tier: PaidTier | "unknown";
    cycle: BillingCycle | "unknown";
  };
  /** Stripe Customer Portal を開いた瞬間 (解約導線の入口)。 */
  billing_portal_opened: Record<string, never>;
};

export type AppEventName = keyof EventProps;

/** イベント名のリテラルユニオンを runtime でも参照したい場面用。 */
export const APP_EVENT_NAMES = [
  "pricing_cta_click",
  "pricing_cycle_toggled",
  "signup_submit",
  "signup_complete",
  "watch_created",
  "checkout_started",
  "checkout_completed",
  "billing_portal_opened",
] as const satisfies readonly AppEventName[];
