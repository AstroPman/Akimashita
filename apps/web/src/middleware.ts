import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的ファイル・画像・favicon は除外。
     * - _next/static, _next/image
     * - favicon.ico, sitemap.xml, robots.txt
     * - 拡張子を持つファイル（.svg, .png 等）
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)",
  ],
};
