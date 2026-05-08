import { headers } from "next/headers";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * ブラウザから見た公開オリジン（例: https://example.com）を返す。
 * Supabase の redirectTo / emailRedirectTo、Stripe の success_url などに使う。
 *
 * 通常はリクエストヘッダーから構築する。欠落時や誤って localhost しか取れない場合は
 * NEXT_PUBLIC_SITE_URL を参照する（ステージング・本番でメール内リンクが 127.0.0.1 になるのを防ぐ）。
 */
export async function getPublicOrigin(): Promise<string | undefined> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const fromRequest = host ? `${protocol}://${host}` : undefined;

  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
    ? stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined;

  if (fromEnv && !isLocalhostOrigin(fromEnv)) {
    if (!fromRequest || isLocalhostOrigin(fromRequest)) {
      return fromEnv;
    }
  }

  return fromRequest ?? fromEnv;
}
