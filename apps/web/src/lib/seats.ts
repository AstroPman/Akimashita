import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getMaxSeats } from "@/lib/stripe/config";

export interface SeatsSnapshot {
  occupied: number;
  max: number;
  remaining: number;
  isFull: boolean;
}

/**
 * 限定席の現在の状況を取得する。
 * 公開ページ（LP / 料金 / waitlist）からも呼ぶため、認証済みクライアントで OK。
 * count_occupied_seats RPC は anon にも grant 済み。
 */
export async function getSeatsSnapshot(): Promise<SeatsSnapshot> {
  const supabase = await createClient();
  const max = getMaxSeats();
  const { data, error } = await supabase.rpc("count_occupied_seats");
  if (error) {
    console.error("[seats] count_occupied_seats 失敗", error);
    return { occupied: max, max, remaining: 0, isFull: true };
  }
  const occupied = typeof data === "number" ? data : Number(data ?? 0);
  const remaining = Math.max(0, max - occupied);
  return {
    occupied,
    max,
    remaining,
    isFull: remaining <= 0,
  };
}

/**
 * Checkout 開始時に席を予約する。
 * - 戻り値 true: 仮押さえ完了（subscriptions.status='incomplete' が立っている）
 * - 戻り値 false: 満員。呼び出し側で /waitlist へ誘導すること。
 */
export async function tryReserveSeat(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const max = getMaxSeats();
  const { data, error } = await supabase.rpc("try_reserve_seat", {
    target_user_id: userId,
    max_seats: max,
  });
  if (error) {
    console.error("[seats] try_reserve_seat 失敗", error);
    return false;
  }
  return Boolean(data);
}

/**
 * ユーザのサブスクが利用可能な状態か。 (authenticated) レイアウトと
 * watches actions の防御的判定で利用する。
 */
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("is_subscription_active", {
    target_user_id: userId,
  });
  if (error) {
    console.error("[seats] is_subscription_active 失敗", error);
    return false;
  }
  return Boolean(data);
}
