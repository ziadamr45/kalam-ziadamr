/**
 * الأقسام الاحتياطية — تسمية غير مألوفة تعبّر عن الوعي والعمق
 * تُستخدم كمرجع ثابت وfallback عند غياب البيانات
 */
export type SectionDef = {
  slug: string;
  name: string;
  description: string;
};

export const SECTIONS: SectionDef[] = [
  {
    slug: "al-athar",
    name: "الأثر",
    description: "أفكار تركت أثرًا.. وتستحق أن تُطبَّق لا أن تُقرأ فقط.",
  },
  {
    slug: "zawaya-ruya",
    name: "زوايا رؤية",
    description: "قراءة مختلفة لما نعيشه كل يوم.. من زاوية لم تنظر إليها من قبل.",
  },
  {
    slug: "mawazeen",
    name: "موازين",
    description: "نزِن القرارات والقيم والأفكار بعينٍ صافية وميزانٍ رصين.",
  },
];

export const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.slug, s]),
);

/** Explicitly retired by the site owner. Do not revive from fallback data. */
export const RETIRED_SECTION_SLUGS: readonly string[] = [
  "afkar-liltatbeq", "أفكار-للتطبيق",
];

/** Resolve only live sections. Legacy names are aliases, never extra sections.
 * An exact database slug wins. Ambiguous or retired names must not redirect.
 */
export function resolveSection<T extends { slug: string; name: string }>(
  slug: string,
  liveSections: readonly T[],
): T | null {
  if (RETIRED_SECTION_SLUGS.includes(slug)) return null;
  const exact = liveSections.find((section) => section.slug === slug);
  if (exact) return exact;
  const legacy = SECTIONS.find((section) => section.slug === slug);
  if (!legacy) return null;
  const matches = liveSections.filter((section) => section.name === legacy.name);
  return matches.length === 1 ? matches[0] : null;
}
