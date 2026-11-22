import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { RETIRED_SECTION_SLUGS } from "@/lib/sections";

/**
 * ============================================================
 * الأقسام الحية من قاعدة البيانات — مصدر الحقيقة الواحد للتذييل
 * ============================================================
 * كان التذييل يعرض قائمة ثابتة hard-coded من lib/sections؛ الآن
 * يُجلب من جدول Section مباشرة (الفعلية فقط بترتيب أولويتها) مع
 * طبقة كاش موسومة بـ «sections» تُبطَل لحظيًا من لوحة التحكم عبر
 * revalidateTag('sections') — تحديث فوري بلا إعادة نشر (Zero-Deploy).
 *
 * عند غياب البيانات لا نعيد أقسامًا قديمة أو محذوفة.
 */

export type LiveSection = { slug: string; name: string };

export const getActiveSections = unstable_cache(
  async (): Promise<LiveSection[]> => {
    try {
      const rows = await prisma.section.findMany({
        where: { active: true, slug: { notIn: [...RETIRED_SECTION_SLUGS] } },
        select: { slug: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      return rows;
    } catch {
      return [];
    }
  },
  ["footer-live-sections-v2"],
  { revalidate: 300, tags: ["sections"] },
);
