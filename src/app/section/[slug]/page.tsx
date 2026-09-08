import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ArticleCard } from "@/components/article-card";
import { getArticlesBySection, getActiveSections } from "@/lib/db-queries";
import { SECTION_MAP, SECTIONS } from "@/lib/sections";

export const revalidate = 300;

/** فك تشفير آمن للـ slugs العربية — يفشل بهدوء لو كانت النسبة حرفية أصلًا */
function safeDecodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateStaticParams() {
  try {
    const sections = await getActiveSections();
    if (sections) return sections.map((s) => ({ slug: s.slug }));
  } catch {}
  return SECTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);
  const def = SECTION_MAP[slug];
  const dbSections = await getActiveSections();
  const name = dbSections?.find((s) => s.slug === slug)?.name ?? def?.name ?? slug;
  return { title: name };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = safeDecodeSlug(rawSlug);
  const def = SECTION_MAP[slug];
  const dbSections = await getActiveSections();
  const section = dbSections?.find((s) => s.slug === slug);
  const name = section?.name ?? def?.name;
  const description = section?.description ?? def?.description ?? "";

  if (!name) notFound();

  const articles = await getArticlesBySection(slug, 30);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-32 pb-10 text-center sm:px-6">
          <h1 className="font-body text-4xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            {name}
          </h1>
          <div className="mx-auto my-5 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
          <p className="font-body mx-auto max-w-xl text-lg leading-9" style={{ color: "var(--ink-muted)" }}>
            {description}
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          {articles.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
              <p className="font-body text-lg leading-9">
                لا توجد مقالات في هذا القسم بعد..
                <br />
                ما يُنشر هنا سيكون مستحقًا، لا مجرد ملء للمساحة.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a, i) => (
                <ArticleCard
                  key={a.id}
                  index={i}
                  article={{
                    id: a.id,
                    slug: a.slug,
                    title: a.title,
                    summary: a.summary,
                    readingTimeSec: a.readingTimeSec,
                    publishedAt: a.publishedAt,
                    section: a.section ? { name: a.section.name, slug: a.section.slug } : null,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
