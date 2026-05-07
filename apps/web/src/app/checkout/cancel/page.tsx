import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "登録をキャンセルしました",
};

export default function CheckoutCancelPage() {
  redirect("/pricing?reason=canceled");
}
