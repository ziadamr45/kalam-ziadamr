"use client";

import { useTheme } from "@/components/providers";

/* أيقونة قمر/شمس */
function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * زر تبديل الثيم — بلا وميض عند إعادة التحميل (Fix Hydration Flicker):
 *
 * قبل اكتمال الترطيب وقراءة الثيم المحفوظ من localStorage يُرسم عنصر نائب
 * بنفس أبعاد الأيقونة تمامًا (h-5 w-5) فلا قفزة تخطيط ولا تضارب ترطيب،
 * وبمجرد الجهوزية (ready) — التي تُرفع في نفس دفعة تحديث الثيم نفسه —
 * تُرسم الأيقونة الصحيحة من أول ظهور: في الوضع الداكن أيقونة الشمس
 * (للانتقال للوضع الساطع)، وفي الساطع أيقونة القمر (للانتقال للليلي).
 *
 * ملاحظة: خاصية suppressHydrationWarning على وسم <html> مفعلة في app/layout.tsx
 * مع سكربت منع الوميض الذي يطبق الثيم قبل أول طلاء، فالخلفية صحيحة فورًا
 * وهذه الأيقونة الوحيدة التي كانت تتبدل — وقد حُسم ذلك هنا.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme, ready } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={ready ? (theme === "dark" ? "الوضع الفاتح" : "الوضع الليلي") : "تبديل الثيم"}
      aria-label="تبديل وضع العرض"
      className={`rounded-full transition-all duration-300 hover:scale-110 hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)] ${className}`}
      style={{ color: "var(--ink)" }}
    >
      {ready ? (
        <ThemeIcon dark={theme === "dark"} />
      ) : (
        /* عنصر نائب بنفس أبعاد الأيقونة أثناء الـ SSR لمنع قفزة الـ Layout والوميض */
        <span className="block h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
