"use client";

import { useEffect, useState } from "react";

/**
 * تفضيلات القراءة الافتراضية — تبويب «الإعدادات والتفضيلات»:
 * وضع القراءة (الساطع/الداكن) وافتراضي التشكيل — تُحفظ لحظة الاختيار
 * بلا زر حفظ، وتُطبق فورًا على الصفحة الحالية كالتبديل من الترويسة تمامًا.
 */

type Theme = "light" | "dark";

const CARDS: Array<{ value: Theme; title: string; hint: string; icon: string }> = [
  {
    value: "light",
    title: "الساطع",
    hint: "ورق كريمي مريح للنهار",
    icon: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
  },
  {
    value: "dark",
    title: "الداكن",
    hint: "ليلي هادئ للعين",
    icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  },
];

export function ReadingPreferencesCard() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [tashkeel, setTashkeelState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("kalam_theme");
      if (stored === "dark" || stored === "light") setThemeState(stored);
      setTashkeelState(window.localStorage.getItem("kalam_tashkeel") === "on");
    } catch {}
    setReady(true);
  }, []);

  const pickTheme = (next: Theme) => {
    setThemeState(next);
    try {
      /* نفس آلية مزوّد الثيم حرفيًا: DOM فوري + تخزين محلي + كوكي البيان */
      const root = document.documentElement;
      if (next === "dark") {
        root.setAttribute("data-theme", "dark");
        root.classList.add("dark");
      } else {
        root.removeAttribute("data-theme");
        root.classList.remove("dark");
      }
      window.localStorage.setItem("kalam_theme", next);
      document.cookie = `kalam_theme=${next}; path=/; max-age=31536000; samesite=lax`;
      /* إبلاغ مزوّد الثيم كي يبقى زر الترويسة متزامنًا ولا يقلب ثيمين */
      window.dispatchEvent(new CustomEvent<Theme>("kalam-theme-change", { detail: next }));
    } catch {}
  };

  const pickTashkeel = (on: boolean) => {
    setTashkeelState(on);
    try {
      /* نفس مفتاح مفتاح التشكيل في صفحة المقال — الافتراضي الجديد يطبق من المقال القادم */
      window.localStorage.setItem("kalam_tashkeel", on ? "on" : "off");
    } catch {}
  };

  return (
    <div
      className="rounded-2xl border p-5 shadow-soft sm:p-6"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
        تفضيلات القراءة الافتراضية
      </h2>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        يُحفظ اختيارك لحظة الضغط ويُطبق على كل زيارة قادمة — بلا زر حفظ ولا انتظار.
      </p>

      {!ready ? (
        <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
          جارٍ قراءة تفضيلاتك..
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {/* وضع القراءة */}
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              وضع القراءة الافتراضي
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {CARDS.map((c) => {
                const active = theme === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => pickTheme(c.value)}
                    aria-pressed={active}
                    className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-right transition-all active:scale-[0.98]"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      background: active ? "var(--accent-soft)" : "transparent",
                    }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: active ? "var(--accent)" : "var(--bg-soft)",
                        color: active ? "#fff" : "var(--ink-muted)",
                      }}
                      aria-hidden
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={c.icon} />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <b className="block text-xs font-bold" style={{ color: "var(--ink)" }}>
                        {c.title}
                      </b>
                      <span className="block text-[11px]" style={{ color: "var(--ink-muted)" }}>
                        {c.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* افتراضي التشكيل */}
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              التشكيل الحرفي افتراضيًا
            </p>
            <p className="mt-1 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
              فعّله إن أحببت قراءة النصوص مشكولة بالكامل في كل مقال جديد.
            </p>
            <div className="mt-2 flex gap-2">
              {[
                { value: true, label: "مُشكول افتراضيًا" },
                { value: false, label: "بلا تشكيل افتراضيًا" },
              ].map((o) => {
                const active = tashkeel === o.value;
                return (
                  <button
                    key={String(o.value)}
                    onClick={() => pickTashkeel(o.value)}
                    aria-pressed={active}
                    className="rounded-xl border px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      color: active ? "var(--accent-strong)" : "var(--ink-muted)",
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
