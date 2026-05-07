import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role キーを使う管理用クライアント。
// Server Actions / Route Handler からのみ利用すること。
// Client Component から import するとビルドが失敗するよう "server-only" を入れている。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase の URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
