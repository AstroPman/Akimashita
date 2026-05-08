import { NextResponse, type NextRequest } from "next/server";

// Vercel Cron から呼び出され、GitHub の repository_dispatch API を叩いて
// .github/workflows/scraper-*.yml を起動するためのエンドポイント。
//
// GitHub Actions の `schedule` トリガーは毎分起動を保証せず、本番運用で
// 5〜15 分の遅延・スキップが発生するため、スケジュール管理を Vercel Cron に
// 寄せる。スケジュール定義は apps/web/vercel.json を参照。
//
// 必要な環境変数:
//   - CRON_SECRET           : Vercel Cron が Authorization: Bearer で付与する値
//   - GITHUB_DISPATCH_TOKEN : repository_dispatch を叩くための fine-grained PAT
//                             (権限: Contents: Read and write / Metadata: Read-only)
//   - GITHUB_OWNER          : リポジトリオーナー
//   - GITHUB_REPO           : リポジトリ名

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 起動可能な event_type のホワイトリスト。
// 値は .github/workflows/scraper-*.yml の repository_dispatch.types と一致させる。
const ALLOWED_EVENT_TYPES = [
  "availability-production",
  "availability-staging",
  "therapists-production",
] as const;
type AllowedEventType = (typeof ALLOWED_EVENT_TYPES)[number];

function isAllowedEventType(value: string | null): value is AllowedEventType {
  return (
    value !== null &&
    (ALLOWED_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron.dispatch-scrape] CRON_SECRET 未設定");
    return NextResponse.json(
      { ok: false, error: "server misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!isAllowedEventType(type)) {
    return NextResponse.json(
      { ok: false, error: `invalid type: ${type ?? "(missing)"}` },
      { status: 400 },
    );
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    console.error("[cron.dispatch-scrape] GitHub 連携用の環境変数が未設定", {
      hasToken: Boolean(token),
      hasOwner: Boolean(owner),
      hasRepo: Boolean(repo),
    });
    return NextResponse.json(
      { ok: false, error: "server misconfigured" },
      { status: 500 },
    );
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "akimashita-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: type,
      client_payload: { trigger: "vercel-cron" },
    }),
    // GitHub API の冪等性は呼び出し側で担保しないため、ここはそのまま投げる。
    cache: "no-store",
  });

  // 成功時は 204 No Content。失敗時はステータスとレスポンスをログに残して 502 を返す。
  if (res.status === 204) {
    return NextResponse.json({ ok: true, type });
  }

  const text = await res.text().catch(() => "");
  console.error("[cron.dispatch-scrape] repository_dispatch 失敗", {
    type,
    status: res.status,
    body: text,
  });
  return NextResponse.json(
    { ok: false, error: "github dispatch failed", status: res.status },
    { status: 502 },
  );
}
