import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1 },
    { url: `${base}/pricing`, lastModified: now, priority: 0.9 },
    { url: `${base}/terms`, lastModified: now, priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
    { url: `${base}/payments`, lastModified: now, priority: 0.3 },
    { url: `${base}/contact`, lastModified: now, priority: 0.3 },
    { url: `${base}/login`, lastModified: now, priority: 0.4 },
    { url: `${base}/signup`, lastModified: now, priority: 0.6 },
  ];
}
