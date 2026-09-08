import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/content-blocks";
import { ArticleBlocks } from "@/components/markdown-blocks";
import {
  LEGAL_DEFAULTS,
  LEGAL_DEFAULTS_UPDATED_AT,
  LEGAL_TITLES,
  type LegalSlug,
} from "@/lib/legal-defaults";
import { formatArabicDate } from "@/lib/utils";

/**
 * عارض الصفحات القانونية الموحد — يقرأ المحتوى المُدار من لوحة التحكم،
 * وإن لم يُحرَّر بعد يعرض النص الافتراضي الرصين المضمّن في الكود.
 */

export const LEGAL_SLUGS: LegalSlug[] = ["privacy", "terms", "dialogue-ethics"];

/**
 * يقرأ محتوى الصفحة + تاريخ آخر تحديث الفعلي:
 * إن وُجدت نسخة محفوظة في قاعدة البيانات → updatedAt منها (يتجدد تلقائيًا مع كل حفظ إداري)
 * وإلا → تاريخ آخر تدقيق للنص الافتراضي
 */
export async function getLegalContent(slug: LegalSlug) {
  try {
    const row = await prisma.legalPage.findUnique({ where: { slug } });
    if (row?.content?.trim()) {
      return {
        title: row.title || LEGAL_TITLES[slug],
        content: row.content,
        updatedAt: row.updatedAt as Date,
      };
    }
  } catch {}
  return {
    title: LEGAL_TITLES[slug],
    content: LEGAL_DEFAULTS[slug],
    updatedAt: new Date(LEGAL_DEFAULTS_UPDATED_AT),
  };
}

export function legalMetadata(slug: LegalSlug): Metadata {
  return {
    title: LEGAL_TITLES[slug],
    description: `الصفحة الرسمية لـ${LEGAL_TITLES[slug]} في منصة كلام له لازمة — واضحة، رصينة، بلا حشو.`,
  };
}

export async function LegalPageView({ slug }: { slug: LegalSlug }) {
  if (!LEGAL_SLUGS.includes(slug)) notFound();
  const { title, content, updatedAt } = await getLegalContent(slug);
  const blocks = parseBlocks(content);

  return (
    <section className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
      <header className="page-chrome text-center">
        <h1 className="font-body text-3xl font-bold leading-[1.8] sm:text-4xl" style={{ color: "var(--ink)" }}>
          {title}
        </h1>
        <div className="mx-auto mt-6 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
        <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
          تاريخ آخر تحديث فعلي لهذه الصفحة معروض في أسفلها — ويتجدد تلقائيًا لحظة اعتماد أي تعديل إداري.
        </p>
      </header>

      <div className="article-body mt-12" style={{ color: "var(--ink)" }}>
        <ArticleBlocks blocks={blocks} />
      </div>

      {/* التاريخ الفعلي لآخر تحديث — وعدٌ نصّي مُطبَّق برمجيًا: يتجدد تلقائيًا مع كل حفظ إداري */}
      <p
        className="mt-12 border-t pt-6 text-center text-xs leading-7"
        style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
      >
        آخر تحديث: {formatArabicDate(updatedAt)}
      </p>
    </section>
  );
}
