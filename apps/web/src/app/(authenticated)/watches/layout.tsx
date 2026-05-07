import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive } from "@/lib/seats";

/**
 * /watches 配下はサブスクが有効なユーザーのみ。
 * 未加入 / 期限切れは /pricing へ送る。
 * (authenticated)/layout で auth は担保済み。
 */
export default async function WatchesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const active = await isSubscriptionActive(user.id);
  if (!active) {
    redirect("/pricing?reason=subscription_required");
  }
  return <>{children}</>;
}
