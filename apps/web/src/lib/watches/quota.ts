import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUserPlanTier } from "@/lib/seats";
import { isUnlimited, watchLimitFor } from "./limits";
import type { PlanTier } from "@/lib/plans";

export interface WatchQuota {
  /** ユーザの現在のプラン */
  tier: PlanTier;
  /** 現在登録中の件数（論理削除済みは除外） */
  used: number;
  /** 上限件数。プレミアムは `Number.POSITIVE_INFINITY`。 */
  max: number;
  /** 残り作成可能件数。無制限プランは `Number.POSITIVE_INFINITY`。 */
  remaining: number;
  /** 上限に到達しているか */
  isFull: boolean;
  /** 上限が無制限か */
  isUnlimited: boolean;
}

/**
 * 認証済みユーザの監視設定の利用状況を返す。
 * RLS により watch_settings は user_id = auth.uid() で自動的に絞り込まれるため、
 * ここでは where 句を明示しない。
 */
export async function getWatchQuota(): Promise<WatchQuota> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tier: PlanTier = user ? await getUserPlanTier(user.id) : "free";
  const max = watchLimitFor(tier);
  const { count, error } = await supabase
    .from("watch_settings")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (error) {
    console.error("[watches] quota count failed", error);
    return buildQuota(tier, 0, max);
  }
  return buildQuota(tier, count ?? 0, max);
}

function buildQuota(tier: PlanTier, used: number, max: number): WatchQuota {
  const unlimited = isUnlimited(max);
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, max - used);
  return {
    tier,
    used,
    max,
    remaining,
    isFull: !unlimited && remaining <= 0,
    isUnlimited: unlimited,
  };
}
