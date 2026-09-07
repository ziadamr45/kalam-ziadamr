/**
 * الأقسام الأربعة المعتمدة — تسمية غير مألوفة تعبّر عن الوعي والعمق
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
  {
    slug: "afkar-liltatbeq",
    name: "أفكار للتطبيق",
    description: "أفكار عملية جاهزة للتنفيذ فورًا.. كلام يتحرك ويصنع أثرًا.",
  },
];

export const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.slug, s]),
);
