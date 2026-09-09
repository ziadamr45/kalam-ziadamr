import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

/**
 * ============================================================
 * قارئ التكوين السيادي للمنصة العامة — جدول SiteConfig (مشترك مع الأدمن)
 * ============================================================
 * يُعدَّل من استوديو التكوين السيادي أو التيرمينال أو MCP في لوحة
 * الأدمن، ويُطبَّق هنا لحظيًا عبر revalidateTag('site-config') +
 * إعادة تحقق عابرة للتطبيقات — بلا إعادة نشر.
 *
 * القيم تُقرأ من جدول SiteConfig (مفتاح/قيمة/تصنيف) مدمجة فوق
 * الافتراضيات، وعند فراغ الجدول يُستكمل من الكتلة القديمة
 * في SystemSetting «site_config» حفاظًا على الإعدادات القائمة.
 */

export type SiteConfig = {
  /* الهوية والعلامة */
  SITE_NAME: string;
  SITE_META_TITLE: string;
  SITE_META_DESC: string;
  FOOTER_TEXT: string;
  COPYRIGHT_TEXT: string;
  SOCIAL_LINKS: { label: string; url: string }[];
  /* النصوص والرسائل */
  WELCOME_MESSAGE: string;
  ONBOARDING_SLIDES: { title: string; text: string }[];
  DISCUSS_BADGE: string;
  DISCUSS_OPENING: string;
  DISCUSS_DISCLAIMER: string;
  /* مفاتيح الميزات */
  COMMENTS_ENABLED: boolean;
  TASHKEEL_ENABLED: boolean;
  AI_DISCUSS_ENABLED: boolean;
  AUDIO_PLAYER_ENABLED: boolean;
  PROPOSALS_ENABLED: boolean;
  ONBOARDING_ENABLED: boolean;
  /* بث تنبيهات الأخطاء 500 لهواتف الإدارة */
  ERROR_ALERTS_ENABLED: boolean;
  /* معايير اقتصاد الأثر */
  IMPACT_READ_COMPLETE: number;
  IMPACT_READ_DAILY_CAP: number;
  IMPACT_COMMENT_APPROVED: number;
  IMPACT_COMMENT_LIKED: number;
  IMPACT_COMMENT_INSPIRING: number;
  IMPACT_COMMENT_UNFEATURED: number;
  IMPACT_AI_DISCUSS: number;
  IMPACT_QUOTE_SHARE: number;
  IMPACT_ELDERS_THRESHOLD: number;
};

const DEFAULTS: SiteConfig = {
  SITE_NAME: "كلام له لازمة",
  SITE_META_TITLE: "كلام له لازمة",
  SITE_META_DESC:
    "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة. منصة فكرية ومعرفية عربية: مقالات رصينة، بلا ضجيج، بلا إعلانات — كلام يستحق وقّتك.",
  FOOTER_TEXT: "نُشر بعناية.. لكلام له لازمة.",
  COPYRIGHT_TEXT: "© كلام له لازمة — جميع الحقوق محفوظة",
  SOCIAL_LINKS: [],
  WELCOME_MESSAGE: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة",
  ONBOARDING_SLIDES: [],
  DISCUSS_BADGE: "مساعد ذكاء اصطناعي",
  DISCUSS_OPENING:
    "أنا هنا لأحاورك حول الأفكار الواردة في هذا المقال ومساعدتك في تحليلها واستخراج أبعادها.",
  DISCUSS_DISCLAIMER:
    "المحاور هو نموذج ذكاء اصطناعي تحليلي، وقد تقع منه أخطاء أو تأويلات؛ يُرجى الرجوع لمتن المقال والمصادر الأصلية دائمًا.",
  COMMENTS_ENABLED: true,
  TASHKEEL_ENABLED: true,
  AI_DISCUSS_ENABLED: true,
  AUDIO_PLAYER_ENABLED: true,
  PROPOSALS_ENABLED: true,
  ONBOARDING_ENABLED: true,
  ERROR_ALERTS_ENABLED: true,
  IMPACT_READ_COMPLETE: 1,
  IMPACT_READ_DAILY_CAP: 2,
  IMPACT_COMMENT_APPROVED: 2,
  IMPACT_COMMENT_LIKED: 1,
  IMPACT_COMMENT_INSPIRING: 10,
  IMPACT_COMMENT_UNFEATURED: -10,
  IMPACT_AI_DISCUSS: 1,
  IMPACT_QUOTE_SHARE: 1,
  IMPACT_ELDERS_THRESHOLD: 350,
};

const LEGACY_KEYS = new Set(["SITE_META_TITLE", "SITE_META_DESC", "FOOTER_TEXT", "COMMENTS_ENABLED", "TASHKEEL_ENABLED"]);

/** القراءة الخام من الجدول + استكمال الكتلة القديمة عند الفراغ */
async function readConfigRaw(): Promise<Partial<SiteConfig>> {
  try {
    const rows = await prisma.siteConfig.findMany({ select: { key: true, value: true } });
    if (rows.length > 0) {
      const stored: Record<string, unknown> = {};
      for (const r of rows) stored[r.key] = r.value;
      return stored as Partial<SiteConfig>;
    }
    /* الجدول فارغ بعد — الكتلة القديمة تُغطي المفاتيح الخمسة التاريخية */
    const legacy = await prisma.systemSetting.findUnique({ where: { key: "site_config" } });
    const stored = (legacy?.value ?? {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const k of Object.keys(stored)) if (LEGACY_KEYS.has(k)) picked[k] = stored[k];
    return picked as Partial<SiteConfig>;
  } catch {
    return {};
  }
}

/** القارئ المُخزَّن مؤقتًا — يُبطَل من الأدمن بوسم site-config */
const getCachedConfig = unstable_cache(
  async () => readConfigRaw(),
  ["site-config-v2"],
  { revalidate: 300, tags: ["site-config"] },
);

/** التكوين الكامل مع الافتراضيات — نسخة مُخزَّنة (للتخطيط والصفحات) */
export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const stored = await getCachedConfig();
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** قراءة طازة بلا كاش — لبوابات API (مفاتيح الميزات وأوزان الأثر) */
export async function getSiteConfigFresh(): Promise<SiteConfig> {
  try {
    const stored = await readConfigRaw();
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** الحزمة القابلة للنشر للعميل — لا أسرار ولا إعدادات حساسة */
export async function getPublicBundle() {
  const cfg = await getSiteConfig();
  /* الأقسام الحية من قاعدة البيانات للتذييل الديناميكي — كاش موسوم بـ «sections» */
  const { getActiveSections } = await import("@/lib/sections-data");
  const liveSections = await getActiveSections();
  return {
    SITE_NAME: cfg.SITE_NAME,
    FOOTER_TEXT: cfg.FOOTER_TEXT,
    COPYRIGHT_TEXT: cfg.COPYRIGHT_TEXT,
    SOCIAL_LINKS: cfg.SOCIAL_LINKS,
    WELCOME_MESSAGE: cfg.WELCOME_MESSAGE,
    ONBOARDING_ENABLED: cfg.ONBOARDING_ENABLED,
    ONBOARDING_SLIDES: cfg.ONBOARDING_SLIDES,
    DISCUSS_BADGE: cfg.DISCUSS_BADGE,
    DISCUSS_OPENING: cfg.DISCUSS_OPENING,
    DISCUSS_DISCLAIMER: cfg.DISCUSS_DISCLAIMER,
    COMMENTS_ENABLED: cfg.COMMENTS_ENABLED,
    AI_DISCUSS_ENABLED: cfg.AI_DISCUSS_ENABLED,
    AUDIO_PLAYER_ENABLED: cfg.AUDIO_PLAYER_ENABLED,
    PROPOSALS_ENABLED: cfg.PROPOSALS_ENABLED,
    /* العتبة الحية لعتبة «أهل الكلمة» — تُستبدل موضع 350 في نصوص التهيئة */
    IMPACT_ELDERS_THRESHOLD: cfg.IMPACT_ELDERS_THRESHOLD,
    /* الأقسام الفعلية المعتمدة — التذييل يرندرها ديناميكيًا، والثابتة fallback */
    LIVE_SECTIONS: liveSections,
  };
}

export type PublicBundle = Awaited<ReturnType<typeof getPublicBundle>>;

/** أوزان اقتصاد الأثر الحية — يتحكم بها الأدمن ديناميكيًا */
export async function getImpactParams() {
  const cfg = await getSiteConfigFresh();
  return {
    READ_COMPLETE: cfg.IMPACT_READ_COMPLETE,
    READ_DAILY_CAP: cfg.IMPACT_READ_DAILY_CAP,
    COMMENT_APPROVED: cfg.IMPACT_COMMENT_APPROVED,
    COMMENT_LIKED: cfg.IMPACT_COMMENT_LIKED,
    COMMENT_INSPIRING: cfg.IMPACT_COMMENT_INSPIRING,
    COMMENT_UNFEATURED: cfg.IMPACT_COMMENT_UNFEATURED,
    AI_DISCUSS: cfg.IMPACT_AI_DISCUSS,
    QUOTE_SHARE: cfg.IMPACT_QUOTE_SHARE,
    ELDERS_THRESHOLD: cfg.IMPACT_ELDERS_THRESHOLD,
  };
}
