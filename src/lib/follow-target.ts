/* اتجاه موضع القراءة الصوتية بالنسبة لشاشة القارئ — يقود سهم زر الرجوع ونصه.
   up: الكلام المسموع فوق الشاشة، down: تحتها، here: ظاهر داخلها بالفعل. */
export type FollowTarget = "up" | "down" | "here";

export function followTargetDirection(
  wordTop: number,
  wordBottom: number,
  viewportHeight: number,
): FollowTarget {
  if (wordBottom < 0) return "up";
  if (wordTop > viewportHeight) return "down";
  return "here";
}

export function followReturnLabel(target: FollowTarget): string {
  return target === "here" ? "تابع مع الصوت" : "ارجع للقراءة";
}

/* نطاق الراحة البصرية: طالما الكلمة داخله لا تتحرك الصفحة خلفها */
export function withinComfortBand(rectTop: number, rectBottom: number, viewportHeight: number): boolean {
  return rectTop >= viewportHeight * 0.22 && rectBottom <= viewportHeight * 0.78;
}

/* التتبع الهادئ: عند اقتراب الكلمة من حافة النطاق تستقر في سطر قراءة
   مريح (~ثلث الشاشة من أعلى) بدل توسيطها في كل مرة */
export function gentleFollowScrollTop(rectTop: number, scrollY: number, viewportHeight: number): number {
  return Math.max(0, scrollY + rectTop - viewportHeight * 0.33);
}

/* «الكلمة مختفية فعلًا» — خارج المساحة القابلة للقراءة بعد استبعاد
   الشريطين الثابتين أعلى وأسفل. وحدها من يُظهر زر «ارجع للقراءة». */
export function isWordOutOfUsableArea(
  rectTop: number,
  rectBottom: number,
  viewportHeight: number,
  topChrome: number,
  bottomChrome: number,
): boolean {
  return rectBottom < topChrome || rectTop > viewportHeight - bottomChrome;
}

export function followReturnAriaLabel(target: FollowTarget): string {
  return target === "here" ? "استئناف تتبع القراءة مع الصوت" : "العودة إلى مكان القراءة";
}