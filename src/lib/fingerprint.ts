/**
 * بصمة الزائر الخفيفة (Private-Light Fingerprint)
 * معرّف عشوائي ثابت يُولَّد مرة واحدة ويُحفظ محليًا — يُستخدم
 * لمنع تكرار التصويت والتعليق المزعج دون جمع أي بيانات حساسة.
 */

const FP_KEY = "kalam_fp";

export function getVisitorFingerprint(): string {
  if (typeof window === "undefined") return "";
  try {
    let fp = window.localStorage.getItem(FP_KEY);
    if (!fp) {
      fp =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2, 12)}`;
  }
}
