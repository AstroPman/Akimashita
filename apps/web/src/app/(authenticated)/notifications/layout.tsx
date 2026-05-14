import type { ReactNode } from "react";
import { requirePlanTierAtLeast } from "@/lib/plan-guard";

export default async function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlanTierAtLeast("standard", "notifications_locked");
  return <>{children}</>;
}
