/**
 * セラピストの画像 URL を絶対 URL に解決する。
 * 予約サイト由来で相対パスのこともあるため、profile_url を基準に組み立てる。
 */
export function resolveTherapistImageSrc(
  imageUrl: string | null,
  profileUrl: string | null,
): string | null {
  if (!imageUrl?.trim()) return null;
  const trimmed = imageUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!profileUrl) return null;
  try {
    return new URL(trimmed, profileUrl).href;
  } catch {
    return null;
  }
}
