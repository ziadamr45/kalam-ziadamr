/**
 * ============================================================
 * محرك الهوية المستقلة — منطق العرض الديناميكي (Fallback)
 * ============================================================
 * تسجيل الدخول عبر Google بوابة توثيق وأمان، لكن للقارئ الحق
 * الكامل في اختيار اسمه المعروض وصورته الرمزية:
 *   displayName  = customName || name
 *   displayAvatar = customImage || image
 * يُطبق في كل أركان المنصة: الهيدر، بطاقات التعليقات، محاور
 * الذكاء الاصطناعي، وسجل التفاعلات.
 */

export type IdentityOwner = {
  customName?: string | null;
  name?: string | null;
  customImage?: string | null;
  image?: string | null;
};

/** الاسم المعروض للعامة — المخصص أولًا ثم اسم Google ثم «قارئ» */
export function displayName(u: IdentityOwner | null | undefined): string {
  if (!u) return "قارئ";
  return u.customName?.trim() || u.name?.trim() || "قارئ";
}

/** الصورة المعروضة — المرفوعة مخصصًا أولًا ثم صورة Google */
export function displayAvatar(u: IdentityOwner | null | undefined): string | null {
  if (!u) return null;
  return u.customImage?.trim() || u.image?.trim() || null;
}

/**
 * فحص الاسم المخصص — يمنع الفارغ والمسيء والطول غير المناسب.
 * يعيد رسالة خطأ عربية أو null عند الصلاحية.
 */
export function validateCustomName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "الاسم المعروض لا يمكن أن يكون فارغًا";
  if (name.length < 2) return "الاسم قصير جدًا — حرفان على الأقل";
  if (name.length > 40) return "الاسم طويل — 40 حرفًا كحد أقصى";
  if (/(https?:\/\/|www\.|@|\+?\d{5,})/i.test(name)) {
    return "الاسم المعروض لا يقبل روابط أو أرقام تواصل — هذه مساحة لهويتك لا لإعلانك";
  }
  return null;
}

/** فحص النبذة القصيرة */
export function validateBio(raw: string): string | null {
  const bio = raw.trim();
  if (bio.length > 200) return "النبذة مقتضبة بطبعها — 200 حرف كحد أقصى";
  return null;
}
