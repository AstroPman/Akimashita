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

/**
 * 「空き通知に追加」CTA の設置場所。watch ファネルの脱落箇所を特定するため、
 * クリック・説明モーダル表示イベントに付与する。
 */
export type WatchCtaPlacement =
  /** サロン詳細のセラピスト一覧グリッド上のボタン。 */
  | "salon_grid"
  /** セラピスト詳細ページ上部のヒーロー内ボタン。 */
  | "therapist_hero"
  /** セラピスト詳細ページの「集計データなし」カード内ボタン。 */
  | "therapist_stats_empty"
  /** セラピスト詳細ページのモバイル固定フッターボタン。 */
  | "therapist_mobile_sticky";

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
  /**
   * 「空き通知に追加」CTA をクリックした瞬間。
   * watch ファネルの最上段。`watch_created` が 0 の原因が「そもそもボタンが
   * 押されていない」のか「押した後に離脱」なのかを切り分けるための主要指標。
   */
  watch_cta_clicked: {
    therapist_id: string;
    placement: WatchCtaPlacement;
    /** クリック時点でログイン済みか。未ログインなら説明モーダルが開く。 */
    authenticated: boolean;
  };
  /**
   * 未ログインユーザに対し「空き通知」説明モーダルが表示された瞬間。
   * `watch_cta_clicked` (未ログイン) → ここ → signup の脱落を測る。
   */
  watch_explainer_viewed: {
    therapist_id: string;
    placement: WatchCtaPlacement;
  };
  /** 説明モーダル内の「無料でアカウントを作成」CTA をクリックした瞬間。 */
  watch_explainer_signup_clicked: {
    therapist_id: string;
    placement: WatchCtaPlacement;
  };
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
  /** 口コミ投稿フォーム (Dialog) を開いた瞬間。 */
  review_form_started: {
    therapist_id: string;
  };
  /** 口コミの投稿を完了した瞬間 (Server Action 成功後)。 */
  review_submitted: {
    therapist_id: string;
    rating: number;
    has_body: boolean;
    /** ユーザが入力した新規タグの数 (PR2 で追加)。 */
    tag_count: number;
  };
  /** 自分の口コミを削除した瞬間 (account/reviews から)。 */
  review_deleted: {
    review_id: string;
  };
  /**
   * 未課金ユーザが「限定口コミ (sensitive) を見る」CTA をクリックした瞬間。
   * sensitive paywall の効果 (アップグレード転換) を測る主要指標。
   */
  paywall_sensitive_review_clicked: {
    therapist_id: string;
    count: number;
  };
};

export type AppEventName = keyof EventProps;

/** イベント名のリテラルユニオンを runtime でも参照したい場面用。 */
export const APP_EVENT_NAMES = [
  "pricing_cta_click",
  "pricing_cycle_toggled",
  "signup_submit",
  "signup_complete",
  "watch_cta_clicked",
  "watch_explainer_viewed",
  "watch_explainer_signup_clicked",
  "watch_created",
  "checkout_started",
  "checkout_completed",
  "billing_portal_opened",
  "review_form_started",
  "review_submitted",
  "review_deleted",
  "paywall_sensitive_review_clicked",
] as const satisfies readonly AppEventName[];
