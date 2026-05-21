import { countPublicTherapists } from "@/lib/salons";

/**
 * Sitemap Index XML を返すルート。
 *
 * Next.js の `app/sitemap.ts` + `generateSitemaps` は sub-sitemap のみを
 * `/sitemap/<id>.xml` として配信し、root の `/sitemap.xml`（sitemap index）は
 * 自動生成しない仕様（vercel/next.js#77304）。robots.txt と GSC からは
 * このルート (`/sitemap-index.xml`) を sitemap として参照させる。
 *
 * 生成する <sitemap> 一覧は `app/sitemap.ts` の `generateSitemaps()` と
 * 同じロジックで揃える必要がある。ロジック変更時はこの 2 ファイルを必ず同時に更新。
 */

// app/sitemap.ts と必ず同じ値にする。
const THERAPIST_CHUNK_SIZE = 5_000;

// Googlebot は短時間に複数 sub-sitemap を取りに来るので、index 自体も
// 1 時間 ISR キャッシュして都度 DB に件数取得を打たないようにする。
export const revalidate = 3600;

export async function GET() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const now = new Date().toISOString();

  let therapistChunks = 1;
  try {
    const total = await countPublicTherapists();
    therapistChunks = Math.max(1, Math.ceil(total / THERAPIST_CHUNK_SIZE));
  } catch (e) {
    console.error("[sitemap-index] countPublicTherapists failed:", e);
  }

  const ids: string[] = [
    "static",
    "salons",
    ...Array.from(
      { length: therapistChunks },
      (_, i) => `therapists-${i}`,
    ),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ids.map(
      (id) =>
        `  <sitemap>\n    <loc>${base}/sitemap/${id}.xml</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`,
    ),
    "</sitemapindex>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
