import { prisma } from "@/lib/prisma";

/**
 * إعدادات الموقع العامة — يحكمها الأدمن بالكامل من لوحة التحكم السيادية.
 * تُخزن في SystemSetting تحت مفتاح site_config وتُقرأ هنا مع قيم افتراضية رصينة.
 */

export type SiteConfig = {
  SITE_META_TITLE: string;
  SITE_META_DESC: string;
  FOOTER_TEXT: string;
  COMMENTS_ENABLED: boolean; // مفتاح الإيقاف الفوري (Kill Switch) لقسم التعليقات
  TASHKEEL_ENABLED: boolean; // وضع التشكيل عامًا — ويمكن تعطيله لكل مقال على حدة
};

const DEFAULTS: SiteConfig = {
  SITE_META_TITLE: "كلام له لازمة",
  SITE_META_DESC:
    "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
  FOOTER_TEXT: "نُشر بعناية.. لكلام له لازمة.",
  COMMENTS_ENABLED: true,
  TASHKEEL_ENABLED: true,
};

const KEY = "site_config";

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
    if (row?.value) {
      const stored = row.value as Partial<SiteConfig>;
      return { ...DEFAULTS, ...stored };
    }
  } catch {}
  return { ...DEFAULTS };
}
