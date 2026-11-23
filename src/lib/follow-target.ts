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
  return target === "here" ? "تابع مع الصوت" : "ارجع لمكان القراءة";
}

export function followReturnAriaLabel(target: FollowTarget): string {
  return target === "here" ? "استئناف تتبع القراءة مع الصوت" : "العودة إلى مكان القراءة";
}