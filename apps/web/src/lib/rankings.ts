import { createClient } from "@/lib/supabase/server";

export interface RankingTherapistBase {
  therapistId: string;
  name: string;
  imageUrl: string | null;
  profileUrl: string | null;
  salonId: string;
  salonName: string;
}

export interface KillTimeRankingRow extends RankingTherapistBase {
  /** 直近 window_days 日の瞬殺時間中央値（秒） */
  medianKillSeconds: number;
  /** ペアリングできた close サンプル数 */
  sampleCount: number;
}

export interface WatcherCountRankingRow extends RankingTherapistBase {
  /** アクティブな監視設定のユニークユーザ数 */
  watcherCount: number;
}

type KillTimeRpcRow = {
  therapist_id: string;
  name: string;
  image_url: string | null;
  profile_url: string | null;
  salon_id: string;
  salon_name: string;
  median_kill_seconds: number;
  sample_count: number;
};

type WatcherCountRpcRow = {
  therapist_id: string;
  name: string;
  image_url: string | null;
  profile_url: string | null;
  salon_id: string;
  salon_name: string;
  watcher_count: number;
};

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_MIN_SAMPLES = 5;

export interface KillTimeRankingOptions {
  limit?: number;
  windowDays?: number;
  minSamples?: number;
}

export async function getKillTimeRanking(
  options: KillTimeRankingOptions = {},
): Promise<KillTimeRankingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_kill_time_ranking", {
    p_limit: options.limit ?? DEFAULT_LIMIT,
    p_window_days: options.windowDays ?? DEFAULT_WINDOW_DAYS,
    p_min_samples: options.minSamples ?? DEFAULT_MIN_SAMPLES,
  });

  if (error) {
    console.error("getKillTimeRanking (rpc):", error.message);
    return [];
  }

  const rows = (data ?? []) as KillTimeRpcRow[];
  return rows.map((row) => ({
    therapistId: row.therapist_id,
    name: row.name,
    imageUrl: row.image_url,
    profileUrl: row.profile_url,
    salonId: row.salon_id,
    salonName: row.salon_name,
    medianKillSeconds: row.median_kill_seconds,
    sampleCount: row.sample_count,
  }));
}

export async function getWatcherCountRanking(
  limit: number = DEFAULT_LIMIT,
): Promise<WatcherCountRankingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_watcher_count_ranking", {
    p_limit: limit,
  });

  if (error) {
    console.error("getWatcherCountRanking (rpc):", error.message);
    return [];
  }

  const rows = (data ?? []) as WatcherCountRpcRow[];
  return rows.map((row) => ({
    therapistId: row.therapist_id,
    name: row.name,
    imageUrl: row.image_url,
    profileUrl: row.profile_url,
    salonId: row.salon_id,
    salonName: row.salon_name,
    watcherCount: row.watcher_count,
  }));
}

export const RANKING_DEFAULTS = {
  limit: DEFAULT_LIMIT,
  windowDays: DEFAULT_WINDOW_DAYS,
  minSamples: DEFAULT_MIN_SAMPLES,
} as const;
