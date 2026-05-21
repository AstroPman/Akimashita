import type { MetadataRoute } from "next";
import {
  countPublicTherapists,
  getPublicSalonsForSitemap,
  listPublicTherapistsForSitemapPage,
} from "@/lib/salons";

// 1 sub-sitemap あたりに含めるセラピスト件数。
// Google の sitemap 上限は 50,000 URL / 50 MB（uncompressed）。1 URL ~200 byte 程度なので
// 5,000 URL なら約 1 MB に収まる。Vercel Functions のタイムアウトと CDN 転送の両面で
// 安全圏。サロンや静的ページはこれより少ないので別 sitemap に分ける。
const THERAPIST_CHUNK_SIZE = 5_000;

// 動的データを 1 時間 ISR キャッシュする。
// Googlebot は短時間に複数 sub-sitemap を連続で取りに来るので、毎回 Supabase に
// 問い合わせると Vercel Functions のタイムアウト（9.2 MB / 30 秒問題）に再び引っかかる。
// 1 時間遅延でも sitemap としては十分新鮮。
export const revalidate = 3600;

/**
 * 公開サイトマップを分割するための ID 一覧。
 *
 * Next.js は各 ID に対して `default sitemap()` を呼び出して `/sitemap/<id>.xml`
 * として配信し、`/sitemap.xml` 自体は sitemap index XML を自動生成して各
 * sub-sitemap を参照する。
 *
 * 内訳:
 *   - static       : 静的ページ
 *   - salons       : 公開サロン全件 (~700)
 *   - therapists-N : セラピストを {THERAPIST_CHUNK_SIZE} 件ずつチャンク化したもの
 *
 * Next.js 16 から `id` は Promise<string> なので、`sitemap()` 側で `await` する。
 */
export async function generateSitemaps() {
  const total = await countPublicTherapists();
  const therapistChunks = Math.max(1, Math.ceil(total / THERAPIST_CHUNK_SIZE));

  return [
    { id: "static" },
    { id: "salons" },
    ...Array.from(
      { length: therapistChunks },
      (_, i) => ({ id: `therapists-${i}` }),
    ),
  ];
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const now = new Date();

  if (id === "static") {
    return [
      { url: `${base}/`, lastModified: now, priority: 1 },
      { url: `${base}/pricing`, lastModified: now, priority: 0.9 },
      { url: `${base}/salons`, lastModified: now, priority: 0.9 },
      { url: `${base}/terms`, lastModified: now, priority: 0.3 },
      { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
      { url: `${base}/payments`, lastModified: now, priority: 0.3 },
      { url: `${base}/contact`, lastModified: now, priority: 0.3 },
      { url: `${base}/login`, lastModified: now, priority: 0.4 },
      { url: `${base}/signup`, lastModified: now, priority: 0.6 },
    ];
  }

  if (id === "salons") {
    try {
      const salons = await getPublicSalonsForSitemap();
      return salons.map((s) => ({
        url: `${base}/salons/${s.id}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    } catch (e) {
      console.error("[sitemap:salons] failed:", e);
      return [];
    }
  }

  if (id.startsWith("therapists-")) {
    const chunkIndex = Number.parseInt(id.slice("therapists-".length), 10);
    if (!Number.isFinite(chunkIndex) || chunkIndex < 0) return [];

    try {
      const offset = chunkIndex * THERAPIST_CHUNK_SIZE;
      const therapists = await listPublicTherapistsForSitemapPage(
        offset,
        THERAPIST_CHUNK_SIZE,
      );
      return therapists.map((t) => ({
        url: `${base}/salons/${t.salonId}/therapists/${t.id}`,
        lastModified: t.updatedAt ? new Date(t.updatedAt) : now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    } catch (e) {
      console.error(`[sitemap:${id}] failed:`, e);
      return [];
    }
  }

  return [];
}
