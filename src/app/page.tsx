import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ArticleCard } from "@/components/article-card";
import { getLatestArticles, getActiveSections } from "@/lib/db-queries";
import { getSiteConfig } from "@/lib/site-config";
import { SECTIONS } from "@/lib/sections";
import PushPromptCapsule from "@/components/push-prompt-capsule";

export const revalidate = 300;

const PHILOSOPHY = [
  {
    title: "لا حشو",
    body: "كل سطر يُكتب مرتين في ذهننا قبل أن يُنشر مرة.. إن لم يُضف شيئًا، لا يُنشر أصلًا.",
  },
  {
    title: "لا ضجيج",
    body: "بلا إعلانات مزعجة ولا إشعارات مطاردة. هنا تقرأ في هدوء تام، والواجهة تختفي ليتركز ذهنك.",
  },
  {
    title: "لا سطحية",
    body: "مقالات تمرّ عبر قائمة فحص أخلاقي صارمة قبل النشر.. إن لم يكن لها لازمة، فهي ليست منّا.",
  },
];

export default async function HomePage() {
  const [articles, dbSections, cfg] = await Promise.all([
    getLatestArticles(9),
    getActiveSections(),
    getSiteConfig().catch(() => null),
  ]);

  const sections =
    dbSections && dbSections.length > 0
      ? dbSections.map((s) => ({ slug: s.slug, name: s.name, description: s.description ?? "" }))
      : SECTIONS;

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* البطل — الهوية والشعار المندمج */}
        <section className="relative overflow-hidden pt-32 pb-20 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
            style={{
              background:
                "radial-gradient(60% 100% at 50% 0%, var(--accent-soft) 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
            <h1 className="font-body text-4xl font-bold leading-[1.6] sm:text-5xl sm:leading-[1.6]" style={{ color: "var(--ink)" }}>
              {cfg?.SITE_NAME ?? "كلام له لازمة"}
            </h1>
            <div className="mx-auto my-6 h-[3px] w-24 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
            <p className="font-body text-xl leading-9 sm:text-2xl sm:leading-10" style={{ color: "var(--ink-muted)" }}>
              {(cfg?.WELCOME_MESSAGE ?? "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.").split("\n").map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
            <p className="font-ui mt-8 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
              منصة فكرية ومعرفية عربية.. نقية من الضجيج، غنية بالعمق.
            </p>
          </div>
        </section>

        {/* أحدث المقالات — المرساة id مطلوبة لاختصار PWA «أحدث المقالات» */}
        <section id="latest-articles" className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-16 sm:px-6">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="font-ui text-2xl font-bold" style={{ color: "var(--ink)" }}>
              أحدث ما له لازمة
            </h2>
          </div>

          {articles.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed p-12 text-center"
              style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
            >
              <p className="font-body text-lg leading-9">
                الكلام الأول الذي «له لازمة» قادم قريبًا..
                <br />
                الجاري الآن اختيار الكلمات التي تستحق.
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

        {/* الأقسام */}
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="font-ui mb-8 text-2xl font-bold" style={{ color: "var(--ink)" }}>
            الأقسام
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {sections.map((s) => (
              <Link
                key={s.slug}
                href={`/section/${s.slug}`}
                className="group rounded-2xl border p-6 shadow-soft transition-all duration-500 ease-fluid hover:-translate-y-1 hover:shadow-lift"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <h3 className="font-ui text-lg font-bold transition-colors group-hover:text-[var(--accent)]" style={{ color: "var(--ink)" }}>
                  {s.name}
                </h3>
                <p className="font-body mt-2 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
                  {s.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* فلسفة التحرير */}
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
          <div className="rounded-3xl border p-8 sm:p-10" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <h2 className="font-ui mb-2 text-center text-2xl font-bold" style={{ color: "var(--ink)" }}>
              لماذا هنا؟
            </h2>
            <p className="mb-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              لأن وقتك أمانة.. والكلام الذي لا يُحسب لا يستحق شاشتك.
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {PHILOSOPHY.map((p) => (
                <div key={p.title} className="text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <h3 className="font-ui font-bold" style={{ color: "var(--ink)" }}>{p.title}</h3>
                  <p className="font-body mt-2 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      {/* كبسولة تفعيل الإشعارات الذكية — الرئيسية فقط، ممنوعة في المقالات */}
      <PushPromptCapsule />
      <Footer />
    </>
  );
}
