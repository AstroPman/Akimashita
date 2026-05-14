import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlanTier } from "@/lib/seats";
import { isAtLeastTier, type PlanTier } from "@/lib/plans";

/**
 * 指定 tier 以上のプランを要求する。満たさない場合は /pricing?reason=... へリダイレクト。
 * (authenticated) layout でログインは担保されている前提。
 */
export async function requirePlanTierAtLeast(
  required: PlanTier,
  reason: string,
): Promise<PlanTier> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const tier = await getUserPlanTier(user.id);
  if (!isAtLeastTier(tier, required)) {
    redirect(`/pricing?reason=${encodeURIComponent(reason)}`);
  }
  return tier;
}
