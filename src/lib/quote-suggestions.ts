/**
 * اقتراحات بطاقة الاقتباس — جمل كاملة تقف بذاتها وتصلح للمشاركة.
 * لا تُقتطع أي جملة ولا يُعاد صوغ أي نص: إمّا تُعرض كما كتبها المحرر، أو تُستبعد.
 * المصادر بالترتيب: الاقتباس المميّز (> ) ← نقاط الملخص بعد حذف عنوانها
 * ← الجمل المغمّقة الكاملة في المتن.
 */

export const MAX_SUGGESTED_WORDS = 45;
const MIN_SUGGESTED_WORDS = 6;

function plain(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** حذف عنوان النقطة (مثل «الخلاصة:» أو «نقطة قابلة للتطبيق:») — العنوان وصف لا اقتباس */
export function stripLabel(line: string): string {
  const m = line.match(/^([^:：.؟!]{2,28})[:：]\s+(.+)$/s);
  if (!m) return line;
  const labelWords = m[1].trim().split(/\s+/).length;
  return labelWords <= 4 ? m[2].trim() : line;
}

function wordCount(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

/** جملة مكتملة: تنتهي بعلامة ختام ولا تبدأ بوصل يُسقطها عن سياقها */
function isStandalone(t: string): boolean {
  const n = wordCount(t);
  if (n < MIN_SUGGESTED_WORDS || n > MAX_SUGGESTED_WORDS) return false;
  if (!/[.!؟?…»”"]$/.test(t)) return false;
  if (/^[﴿«]/.test(t)) return false; // الآيات والأحاديث لها كتلها الخاصة
  if (/^(و|ف|لكن|لذلك|ولكن|إذن|بل|ثم|أي|أو)(\s|$)/.test(t)) return false;
  return true;
}

export function suggestQuotes(content: string, summary: string, limit = 6): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const c = plain(t);
    if (!c || !isStandalone(c)) return;
    if (out.some((o) => o === c)) return;
    out.push(c);
  };

  const lines = content.split("\n").map((l) => l.trim());
  for (const l of lines) if (l.startsWith("> ")) add(l.slice(2));

  for (const l of summary.split(/\n+/)) add(stripLabel(l.trim()));

  for (const l of lines) {
    if (l.startsWith(">") || l.startsWith("#") || l.startsWith(":::")) continue;
    for (const m of l.matchAll(/\*\*(.+?)\*\*/g)) add(m[1]);
  }
  return out.slice(0, limit);
}
