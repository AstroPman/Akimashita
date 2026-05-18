import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { DashboardNav } from "@/components/nav";

export const metadata: Metadata = {
  title: {
    default: "Akimashita Admin Dashboard",
    template: "%s | Akimashita Admin",
  },
  description: "アキマシタ運営向けの管理ダッシュボード（ローカル限定）",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex bg-background text-foreground">
        <DashboardNav className="sticky top-0 h-screen" />
        <main className="flex-1 p-6 lg:p-10 overflow-x-auto">{children}</main>
      </body>
    </html>
  );
}
