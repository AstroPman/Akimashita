import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role キーを使う管理用クライアント。
// ダッシュボードはローカル限定運用かつ読み取りのみだが、本番Supabaseに対して
// 強い権限を持つキーで動作するため、Client Component から import するとビルドが
// 失敗するよう "server-only" を入れている。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase の URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません。apps/dashboard/.env.local を確認してください。",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
