import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MAX_WATCH_SETTINGS_PER_USER } from "./limits";

export interface WatchQuota {
  /** 現在登録中の件数（論理削除済みは除外） */
  used: number;
  /** 上限件数 */
  max: number;
  /** 残り作成可能件数 */
  remaining: number;
  /** 上限に到達しているか */
  isFull: boolean;
}

/**
 * 認証済みユーザの監視設定の利用状況を返す。
 * RLS により watch_settings は user_id = auth.uid() で自動的に絞り込まれるため、
 * ここでは where 句を明示しない。
 */
export async function getWatchQuota(): Promise<WatchQuota> {
  const supabase = await createClient();
  const max = MAX_WATCH_SETTINGS_PER_USER;
  const { count, error } = await supabase
    .from("watch_settings")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (error) {
    console.error("[watches] quota count failed", error);
    return { used: 0, max, remaining: max, isFull: false };
  }
  const used = count ?? 0;
  const remaining = Math.max(0, max - used);
  return { used, max, remaining, isFull: remaining <= 0 };
}
