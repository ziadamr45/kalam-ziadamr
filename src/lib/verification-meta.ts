/**
 * ============================================================
 * تصنيفات التوثيق الرسمي — وحدة آمنة للعميل والخادم معًا
 * ============================================================
 * الفصل المعماري الصريح: «التوثيق» إثبات هوية (Proof of Identity)
 * لا يحمل أي امتيازات بذاته، أما «العضوية المميزة» فامتيازات
 * وشارات مستقلة (VIP Privileges) — قد يجتمعان أو يفترقان.
 *
 * ألوان الختم الرسمي وفق تصنيف الحساب:
 * ذهبي للمؤسس، كحلي لنخبة أهل الكلمة، زيتي للكتاب الرسميين،
 * فيروزي لأفراد العائلة الموثقين.
 */

export type VerificationType = "OWNER" | "OFFICIAL_AUTHOR" | "FAMILY_CORE" | "NOTABLE";

export const VERIFICATION_TYPES: VerificationType[] = [
  "OWNER",
  "OFFICIAL_AUTHOR",
  "FAMILY_CORE",
  "NOTABLE",
];

export const VERIFICATION_TYPE_META: Record<
  VerificationType,
  { color: string; label: string; hint: string }
> = {
  OWNER: {
    color: "#D97706",
    label: "المؤسس",
    hint: "توثيق صاحب المنصة السيادي — ختم ذهبي حصري بالبذر التلقائي",
  },
  NOTABLE: {
    color: "#1E3A8A",
    label: "أهل الكلمة",
    hint: "نخبة الحوار المموّهقين — ختم كحلي/أزرق",
  },
  OFFICIAL_AUTHOR: {
    color: "#6B8E23",
    label: "كاتب رسمي",
    hint: "كتاب المنصة المعتمدون والكتاب الضيوف — ختم زيتي",
  },
  FAMILY_CORE: {
    color: "#0D9488",
    label: "فرد عائلة موثق",
    hint: "نواة العائلة الموثقة رسميًا — ختم فيروزي",
  },
};

/** الوصفية الآمنة — null لأي تصنيف غير معروف أو فارغ */
export function verificationMeta(type: string | null | undefined) {
  if (!type) return null;
  return VERIFICATION_TYPE_META[type as VerificationType] ?? null;
}

/** لون ختم التوثيق — يتطلب تصنيفًا معروفًا، وإلا يُستخدم الأزرق الملكي الاحتياطي */
export function verificationSealColor(type: string | null | undefined): string {
  return verificationMeta(type)?.color ?? "#2563EB";
}

/** التسمية الظاهرة بجانب الختم — المسمى المخصص يفوق تسمية التصنيف */
export function verificationSealLabel(
  type: string | null | undefined,
  label?: string | null,
): string {
  const custom = label?.trim();
  if (custom) return custom;
  return verificationMeta(type)?.label ?? "حساب موثّق";
}

/**
 * روابط البطاقة الفكرية الموثقة — الحقول الاجتماعية العامة الأساسية
 * (استبدالًا للحقول التقنية: تُعرض الحقول الممتلئة فقط للقراء)
 */
export type VerifiedSocialLinks = {
  website?: string;
  facebook?: string;
  instagram?: string;
  telegram?: string;
  whatsapp?: string;
  youtube?: string;
  tiktok?: string;
  x?: string;
  linkedin?: string;
};

export const SOCIAL_LINK_KEYS = [
  "website",
  "facebook",
  "instagram",
  "telegram",
  "whatsapp",
  "youtube",
  "tiktok",
  "x",
  "linkedin",
] as const;

export const SOCIAL_LINK_LABELS: Record<(typeof SOCIAL_LINK_KEYS)[number], string> = {
  website: "الموقع الشخصي أو المدونة",
  facebook: "فيسبوك",
  instagram: "إنستجرام",
  telegram: "تليجرام",
  whatsapp: "واتساب",
  youtube: "قناة يوتيوب",
  tiktok: "تيك توك",
  x: "منصة إكس",
  linkedin: "لينكد إن",
};

/** مطابقة صارمة: https فقط — تُقبل روابط wa.me وt.me وكل الروابط الاجتماعية الآمنة */
export function parseSocialLinks(raw: unknown): VerifiedSocialLinks {
  if (!raw || typeof raw !== "object") return {};
  const out: VerifiedSocialLinks = {};
  for (const key of SOCIAL_LINK_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v.trim())) {
      out[key] = v.trim();
    }
  }
  return out;
}
