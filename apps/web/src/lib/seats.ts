import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanTier, type PlanTier } from "@/lib/plans";

/**
 * ユーザの plan_tier を取得する。
 * 行が無い・取得失敗時は安全側に倒して 'free' を返す。
 *
 * （旧 seats.ts には席数確保・解放のヘルパーがあったが、3 段階プラン導入で
 *  全員登録可能としたため廃止した。）
 */
export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[plans] plan_tier 取得失敗", error);
    return "free";
  }
  const tier = data?.plan_tier;
  return isPlanTier(tier) ? tier : "free";
}

/**
 * ユーザのサブスクが利用可能（有料プラン）な状態か。
 * `is_subscription_active` RPC を呼ぶラッパー。
 * RPC 側は users.plan_tier が standard/premium のとき true を返すように
 * 書き換えられている。
 */
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("is_subscription_active", {
    target_user_id: userId,
  });
  if (error) {
    console.error("[plans] is_subscription_active 失敗", error);
    return false;
  }
  return Boolean(data);
}
