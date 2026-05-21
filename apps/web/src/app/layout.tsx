import type { ReactNode } from "react";
import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "@/components/analytics/posthog-provider";

const mplusRounded = M_PLUS_Rounded_1c({
  variable: "--font-mplus-rounded",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "アキマシタ - メンズエステの空き枠を逃さない（限定サービス）",
    template: "%s | アキマシタ",
  },
  description:
    "お気に入りのセラピストの予約空き枠が出た瞬間にメール通知。通知の価値を保つための限定人数制サービスです。",
  openGraph: {
    type: "website",
    siteName: "アキマシタ",
    locale: "ja_JP",
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${mplusRounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <PostHogProvider>{children}</PostHogProvider>
        <Toaster richColors closeButton position="top-right" />
        <Analytics />
      </body>
    </html>
  );
}
