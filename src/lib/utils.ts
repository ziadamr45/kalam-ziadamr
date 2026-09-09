/** أدوات مساعدة عامة */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** تنسيق تاريخ عربي كامل: ٧ سبتمبر ٢٠٢٦ */
export function formatArabicDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** أرقام شرقية لأي رقم */
export function easternDigits(n: number | string): string {
  return new Intl.NumberFormat("ar-EG").format(Number(n));
}

/** توليد slug من عنوان عربي/لاتيني */
export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^\u0621-\u064Aa-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `kalam-${Date.now().toString(36)}`
  );
}

/** استخراج مقدرة كلمات النص بعد تجريد التشكيل */
export function wordCount(text: string): number {
  if (!text) return 0;
  const stripped = text.replace(/[\u064B-\u0652\u0670\u0640]/g, "");
  return stripped.split(/\s+/).filter(Boolean).length;
}

/** تجريد الحركات والتشكيل والمد من النص — لمطابقة الكلمات بالفهرس
 *  بين النص المشكول (المسموع) والنص المجرد (المعروض) في المزامنة الصوتية */
export function stripDiacritics(s: string): string {
  return s.replace(/[\u064B-\u0652\u0653-\u0658\u0670\u0640]/g, "");
}
