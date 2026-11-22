// Test-only database. No credentials, network, or production writes.
const section = { id: "section-1", slug: "موازين", name: "موازين", description: "قسم تجريبي", active: true, sortOrder: 0, createdAt: new Date("2026-01-01"), _count: { articles: 1 } };
const empty = { ...section, id: "section-2", slug: "empty", name: "قسم فارغ", _count: { articles: 0 } };
const article = {
  id: "article-1", slug: "fixture-article", title: "مقال اختبار المسارات", summary: "ملخص اختبار محلي", content: "محتوى تجريبي لفحص سلامة صفحة المقال.", contentWithTashkeel: "", readingTimeSec: 60,
  sectionId: section.id, section, publishedAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), status: "PUBLISHED",
  coverImage: null, audioUrl: null, audioDurationSec: null, audioCues: null, audioWords: null, tashkeelEnabled: false,
};
const delay = () => new Promise((resolve) => setTimeout(resolve, 80));
const readonlyModel = (name: string) => new Proxy({}, {
  get(_target, method: string) {
    if (!["findFirst", "findMany", "findUnique", "count", "groupBy"].includes(method)) {
      throw new Error(`Write/unsupported operation in routing fixture: ${name}.${method}`);
    }
    return async (args: any) => {
      await delay();
      if (name === "article" && method === "findFirst") {
        const slug = args?.where?.AND?.[0]?.OR?.[0]?.slug;
        if (slug === "db-error") throw new Error("Fixture database unavailable");
        return slug === article.slug ? article : null;
      }
      if (name === "article" && method === "findMany") {
        if (args?.where?.id || args?.where?.section?.slug === empty.slug) return [];
        return [article];
      }
      if (name === "section" && method === "findMany") {
        const stale = { ...empty, slug: "أفكار-للتطبيق", name: "أفكار للتطبيق" };
        return [section, empty, stale].filter((row) => !args?.where?.slug?.notIn?.includes(row.slug));
      }
      if (name === "siteConfig" && method === "findMany") return [{ key: "ONBOARDING_ENABLED", value: false }];
      if (method === "findMany" || method === "groupBy") return [];
      if (method === "count") return 0;
      return null;
    };
  },
});
export const prisma: any = new Proxy({}, { get: (_target, name: string) => readonlyModel(name) });
