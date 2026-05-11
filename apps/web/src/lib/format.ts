/**
 * 瞬殺時間（秒）を「45秒」「3分」「2分10秒」「1時間」「1時間30分」のように整形する。
 * null / 負値はダッシュにフォールバック。
 */
export function formatKillSeconds(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m}分` : `${m}分${s}秒`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
