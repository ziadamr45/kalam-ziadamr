import type { MetadataRoute } from "next";
import { getLatestArticles, getSectionSlugs } from "@/lib/db-queries";
import { SECTIONS } from "@/lib/sections";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kalam-ziadamr.vercel.app";

/* إعادة تحقق ساعية — خريطة الموقع تعكس المقالات الجديدة دون انتظار نشر جديد */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, sectionSlugs] = await Promise.all([
    getLatestArticles(200),
    getSectionSlugs(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const sectionEntries: MetadataRoute.Sitemap = (
    sectionSlugs.length > 0 ? sectionSlugs : SECTIONS.map((s) => s.slug)
  ).map((slug) => ({
    url: `${SITE_URL}/section/${slug}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/article/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...sectionEntries, ...articleEntries];
}
