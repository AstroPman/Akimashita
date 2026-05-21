import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * 公開データ専用の anon クライアント。
 *
 * `server.ts` の `createClient()` は cookies() を読むため Next.js の Request-time API
 * 扱いになり、呼び出した Route Handler / sitemap が強制的に dynamic 化されてキャッシュ
 * されなくなる。一方、sitemap.xml / robots.txt のような公開エンドポイントでは認証文脈
 * 不要なので、cookies を使わない anon クライアントを使って ISR (revalidate) を効かせる。
 *
 * Service Role は不要なので NEXT_PUBLIC_SUPABASE_ANON_KEY を利用。anon キーで取れる
 * 範囲（RLS allow + 公開向け RPC）でしかアクセスしない前提のため、悪用された場合の
 * 影響は通常のフロントエンド anon と同等。
 */
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase の URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
