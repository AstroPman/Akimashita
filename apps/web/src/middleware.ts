import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// ============================================================================
// サイト全体の Basic 認証ゲート（一時的な非公開化）
//
// 2026-07-15: 外部ポータル (men-esthe.jp) 由来のデータ（特にセラピスト写真の
// 直リンク URL が公開 HTML / OG / JSON-LD に露出する点）を外部から見えなくする
// リスク回避策として、サイト全体を Basic 認証の背後に置く。
//
// - BASIC_AUTH_USER と BASIC_AUTH_PASSWORD が「両方」設定されている時だけ有効化する。
//   → ローカル開発（未設定）は素通り。Vercel で両 env を設定した瞬間に非公開化される。
// - 再公開する場合は Vercel の env を削除して再デプロイするだけ。
// ============================================================================

// Basic 認証をバイパスするパス（サーバー間通信で、それぞれ独自の認証を持つため
// Basic 認証を課すと壊れる）。
//   - /api/stripe/webhook : stripe-signature ヘッダで署名検証済み
//   - /api/cron/          : Authorization: Bearer <CRON_SECRET> で検証済み
const BASIC_AUTH_BYPASS_PREFIXES = ["/api/stripe/webhook", "/api/cron/"];

function isBasicAuthEnabled(): boolean {
  return Boolean(
    process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD,
  );
}

// タイミング差による総当たりを避けるための定数時間比較。
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function hasValidBasicAuth(request: NextRequest): boolean {
  const expectedUser = process.env.BASIC_AUTH_USER ?? "";
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD ?? "";

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  // 2 つの比較を短絡させないよう、両方を評価してから AND する。
  const userOk = safeEqual(user, expectedUser);
  const passwordOk = safeEqual(password, expectedPassword);
  return userOk && passwordOk;
}

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="akimashita", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

// Supabase セッション更新（updateSession）を実行すべきルートか。
// 従来の matcher が対象にしていた「ページ / API ルート」だけで走らせ、
// 静的ファイル・sitemap・robots・favicon では実行しない。
const SESSION_SKIP_PATHS = new Set([
  "/favicon.ico",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/robots.txt",
]);

function shouldRunSession(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return false;
  if (SESSION_SKIP_PATHS.has(pathname)) return false;
  // 拡張子付き（.svg / .png 等）の静的ファイルは対象外（旧 matcher の `.*\..*` 相当）。
  if (/\.[^/]+$/.test(pathname)) return false;
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isBypassPath = BASIC_AUTH_BYPASS_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isBasicAuthEnabled() && !isBypassPath && !hasValidBasicAuth(request)) {
    return unauthorizedResponse();
  }

  if (shouldRunSession(pathname)) {
    return await updateSession(request);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Basic 認証ゲートをサイト全体に効かせるため、Next.js のビルド生成物
     * (_next/static, _next/image) 以外の全リクエストを middleware に通す。
     * sitemap.xml / robots.txt / favicon.ico / 拡張子付きファイルも対象に含め、
     * 非公開時はこれらも 401 で保護する（Supabase セッション更新は
     * shouldRunSession() で従来どおりページ/API ルートに限定する）。
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
