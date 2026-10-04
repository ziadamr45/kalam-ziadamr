/**
 * قاعدة ضبط التنوين الصارمة — طبقة اللغة الحاكمة في المنصة العامة:
 * يُوضع التنوين دائمًا على الحرف الذي يسبق ألف التنوين — لا على الألف نفسها.
 *   ✅ عالمًا  شكرًا  مرحبًا
 *   ❌ عالماً  شكراً  مرحباً
 *
 * تُطبَّق حتميًا على كل رد يخرج من محاور الذكاء الاصطناعي إلى القارئ —
 * فالالتزام النحوي لا يُترك للنموذج وحده حتى لو أحسن قواعده في الغالب.
 */

const TANWEEN_CLASS = "\u064B\u064C\u064D"; // ً ٌ ٍ
const ALEF = "\u0627"; // ا

/** نمط «ألف + تنوين» الخاطئ في كل صوره */
const WRONG_NUNATION = new RegExp(`(${ALEF})([${TANWEEN_CLASS}])`, "g");

/** يصحح مواضع التنوين في أي نص عربي */
export function fixNunation(text: string): string {
  if (!text) return text;
  return text.replace(WRONG_NUNATION, (_m, alef: string, tanween: string) => tanween + alef);
}
