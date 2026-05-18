import type { MetadataRoute } from "next";
import {
  getPublicSalons,
  listPublicTherapistsForSitemap,
} from "@/lib/salons";

const SITEMAP_LIMIT = 50_000;

/**
 * 公開サイトマップ。
 *
 * 静的ページ + 全公開サロン + 全公開セラピスト (canonical URL = ネスト URL)
 * を 1 ファイルに収める。Next.js Sitemap の上限は 50,000 URL/ファイル。
 * 現状の規模 (サロン ~700 / セラピスト ~37k) なら十分収まる。
 * 上限に近づいたら `generateSitemaps` で分割する想定。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
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

  // 動的 URL の取得は失敗しても静的部分だけ返してビルドを成立させる。
  // (本番でも sitemap が一時的に薄くなるだけで致命的ではない)
  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const [salons, therapists] = await Promise.all([
      getPublicSalons(),
      listPublicTherapistsForSitemap(),
    ]);

    const salonEntries: MetadataRoute.Sitemap = salons.map((s) => ({
      url: `${base}/salons/${s.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const therapistEntries: MetadataRoute.Sitemap = therapists.map((t) => ({
      url: `${base}/salons/${t.salonId}/therapists/${t.id}`,
      lastModified: t.updatedAt ? new Date(t.updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    dynamicEntries = [...salonEntries, ...therapistEntries];
  } catch (e) {
    console.error("[sitemap] dynamic entries failed:", e);
  }

  const combined = [...staticEntries, ...dynamicEntries];
  // 上限超過時は静的を優先し、超えた末尾を切り捨てる。
  return combined.slice(0, SITEMAP_LIMIT);
}
