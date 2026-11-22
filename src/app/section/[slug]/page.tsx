import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ArticleCard } from "@/components/article-card";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { getArticlesBySection, getRoutingSections } from "@/lib/db-queries";
import { requireSection } from "@/lib/section-route";
import { SECTIONS, RETIRED_SECTION_SLUGS } from "@/lib/sections";

export const revalidate = 300;

export async function generateStaticParams() {
  const sections = await getRoutingSections();
  // Pre-render known legacy paths too, including retired ones as real 404s.
  // This also avoids a cold ISR fallback redirect in Next 15.
  const slugs = new Set([
    ...[...sections, ...SECTIONS].map((section) => section.slug),
    ...RETIRED_SECTION_SLUGS,
  ]);
  return [...slugs].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const section = await requireSection((await params).slug);
  return { title: section.name, alternates: {
    canonical: `/section/${encodeURIComponent(section.slug)}`,
  } };
}

export default async function SectionPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const section = await requireSection((await params).slug);
  const { name, slug } = section;
  const description = section.description ?? "";
  const articles = await getArticlesBySection(slug, 30);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-22 pb-8 text-center sm:px-6 sm:pt-28 sm:pb-10">
          <h1 className="font-body text-4xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            {name}
          </h1>
          <div className="mx-auto my-5 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
          <p className="font-body mx-auto max-w-xl text-lg leading-9" style={{ color: "var(--ink-muted)" }}>
            {description}
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20">
          <FirstVisitHint
            id="section-guide"
            className="mb-6"
            text="تجد هنا مقالات هذا القسم مرتبة من الأحدث؛ يمكنك حفظ أي مقال لقراءته لاحقًا أو بدون إنترنت."
          />
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
      <SiteFooter />
    </>
  );
          }
