/* اختيار خطوات الجولة الصادقة لكل جهاز: خطوة بلا هدف ظاهر ولا فعل تهيئة
   (beforeShow) لا يمكن أن تظهر فعلًا — إبقاؤها يجعل العدّاد «٨ من ٨» كاذبًا
   لأن خطوات تقفز دون أن ترى. على الحاسوب زر «أدوات» مخفي (الأدوات مدمجة)،
   فتخرج خطوته ويصبح العد ٧ من ٧. */
export type TourStepLike = {
  selector?: string;
  beforeShow?: () => void;
};

export function selectTourSteps<T extends TourStepLike>(
  steps: T[],
  isTargetVisible: (selector: string) => boolean,
  targetExists: (selector: string) => boolean,
): T[] {
  return steps.filter((s) => {
    if (!s.selector) return true;
    if (isTargetVisible(s.selector)) return true;
    /* هدف موجود لكنه مخفي (لوحة مغلقة) وقابل للتهيئة — يبقى ويُحسب.
       هدف غير موجود أصلًا (مثل زر التشكيل حين يكون غير متاح) يخرج من العد. */
    return typeof s.beforeShow === "function" && targetExists(s.selector);
  });
}

/* هل الهدف داخل لوحة أدوات القراءة المنشورة؟ تستخدمه الصفحة لتعرف متى
   تفتح اللوحة للجولة ومتى تغلقها بعد مغادرة خطواتها. */
export const READING_TOOLS_PANEL_SELECTORS = [
  "[data-tour='tashkeel-btn']",
  "[data-tour='summary-btn']",
  "[data-tour='pdf-btn']",
  "[data-tour='quote-btn']",
] as const;

export function isReadingToolsPanelStep(selector: string | null | undefined): boolean {
  if (!selector) return false;
  return READING_TOOLS_PANEL_SELECTORS.some((s) => selector === s);
}
