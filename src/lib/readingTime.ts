/**
 * ============================================================
 * محرك التقدير الدقيق لوقت القراءة العربي
 * ============================================================
 * مبني على معدل قراءة النصوص الفكرية العربية (180–200 كلمة/دقيقة،
 * الافتراضي 190) مع حساب زمن التأمل في الاقتباسات والعناوين.
 */

export const ARABIC_WPM = { min: 180, default: 190, max: 200 } as const;

const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const PAUSE_PER_QUOTE_SEC = 5;
const PAUSE_PER_HEADING_SEC = 2;

/** عدد الكلمات الفعلي بعد تجريد التشكيل */
export function countArabicWords(text: string): number {
  if (!text) return 0;
  return text
    .replace(DIACRITICS, "")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** الزمن التقديري بالثواني لقراءة نص عربي فكري */
export function readingSeconds(text: string, wpm: number = ARABIC_WPM.default): number {
  const words = countArabicWords(text);
  const base = (words / wpm) * 60;
  const quotes = (text.match(/^\s*>/gm) || []).length;
  const headings = (text.match(/^\s*##/gm) || []).length;
  const seconds = base + quotes * PAUSE_PER_QUOTE_SEC + headings * PAUSE_PER_HEADING_SEC;
  return Math.max(30, Math.round(seconds));
}

function eastern(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(n);
}

/** التسمية الجميلة بصيغ عربية سليمة: «دقيقة واحدة مركزة»، «دقيقتان مركزتان»، «٤ دقائق مركزة» */
export function formatReadingTime(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes === 1) return "دقيقة واحدة مركزة";
  if (minutes === 2) return "دقيقتان مركزتان";
  if (minutes <= 10) return `${eastern(minutes)} دقائق مركزة`;
  return `${eastern(minutes)} دقيقة مركزة`;
}

/** السطر المعروض فوق المقال */
export function readingTimeLabel(text: string, wpm?: number): string {
  return `مدة القراءة المتوقعة: ${formatReadingTime(readingSeconds(text, wpm))}`;
}
