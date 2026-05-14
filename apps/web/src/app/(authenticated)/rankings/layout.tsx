import type { ReactNode } from "react";
import { requirePlanTierAtLeast } from "@/lib/plan-guard";

export default async function RankingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlanTierAtLeast("standard", "ranking_locked");
  return <>{children}</>;
}
