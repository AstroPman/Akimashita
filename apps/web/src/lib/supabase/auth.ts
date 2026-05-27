import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * 現在のリクエストにおけるログインユーザを取得する。
 *
 * React の `cache()` で同一リクエスト内では結果を memoize するため、
 * `(authenticated)/layout` → ページ本体 → `SiteHeader` のように
 * 同じツリーで何度 `getCurrentUser()` を呼んでも、Supabase Auth への
 * ラウンドトリップは 1 回に抑えられる。
 *
 * 注意:
 * - リクエストごとに独立した cache なので別ユーザの結果が混ざらない
 *   (React の `cache` は React の "request scope" に紐づくため)。
 * - middleware 側の `auth.getUser()` は cookie 更新と保護パスのリダイレ
 *   クトのために別途必要なので、これとは別レイヤとして残す。
 * - Server Action からの呼び出しは 1 回限りで重複が起きないため、
 *   作法統一目的以外では無理に置き換えなくて良い。
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
