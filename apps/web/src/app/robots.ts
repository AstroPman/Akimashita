import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/watches", "/account", "/auth", "/api", "/checkout"],
      },
    ],
    // Next.js の generateSitemaps は sitemap index (/sitemap.xml) を自動生成しない
    // 仕様 (vercel/next.js#77304)。代わりに自前の `/sitemap-index.xml` を提供している。
    sitemap: `${base}/sitemap-index.xml`,
  };
}
