"use client";

import { useEffect, useState } from "react";
import { RANKS, AI_QUOTA_BY_RANK } from "@/lib/ranks";

const EARN_WAYS = [
  { label: "قراءة مقال متأنية", pts: "+١", note: "إتمام قراءة المقال بتركيز" },
  { label: "نقاش عميق مع المحاور الذكي", pts: "+١", note: "عند خوض حوار فكري مثمر" },
  { label: "تعليق هادف معتمد", pts: "+٢", note: "يُضاف بعد اعتماد تعليقك" },
  { label: "إعجاب قارئ بتعليقك", pts: "+١", note: "تقدير القرّاء المسجلين لفكرتك" },
  { label: "تمييز التحرير لتعليقك", pts: "+١٠", note: "يُثبَّت أعلى الحوار كتعليق ملهم" },
];

export function ImpactGuideButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all hover:scale-105 ${className}`}
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        كيف تعمل المنصة؟ (الأثر · الرتب · التوثيق)
      </button>

      {open && (
        <div
          className="fixed inset-0 z-70 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="دليل نقاط الأثر والرتب والتوثيق"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setOpen(false)} />
          <div
            className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-lift animate-fade-in sm:rounded-3xl"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 className="font-ui text-base font-bold sm:text-lg" style={{ color: "var(--ink)" }}>
                  دليل الأثر والرتب والامتيازات
                </h2>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  شرح مبسّط لنظام التقدير داخل «كلام له لازمة»
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق الدليل"
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-(--accent-soft)"
                style={{ color: "var(--ink-muted)" }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 text-sm">
              {/* 1. نقاط الأثر */}
              <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <h3 className="font-ui text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
                  ١. ما هي نقاط الأثر؟ وكيف تكسبها؟
                </h3>
                <p className="mt-1.5 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                  نقاط الأثر تقيس مشاركتك الفكرية الحقيقية في المنصة؛ كلما ارتفع رصيدك، ارتقت رتبتك وتوسّعت حصتك اليومية في محاورة الذكاء الاصطناعي.
                </p>
                <ul className="mt-3 space-y-2">
                  {EARN_WAYS.map((w) => (
                    <li
                      key={w.label}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                          {w.label}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                          {w.note}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                      >
                        {w.pts}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 2. الرتب الفكرية وأهل الكلمة */}
              <section className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <h3 className="font-ui text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
                  ٢. الرتب الفكرية و«أهل الكلمة»
                </h3>
                <p className="mt-1.5 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                  تنتقل تلقائيًا بين أربع رتب فكرية حسب رصيد أثرك، وصولًا إلى رتبة «أهل الكلمة» التي تفتح لك قناة مقترحات خاصة للتواصل المباشر مع إدارة المنصة:
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {RANKS.map((r) => (
                    <div
                      key={r.key}
                      className="rounded-xl border p-3"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ background: r.soft, color: r.color }}
                        >
                          {r.key}
                        </span>
                        <span className="text-[11px] font-bold" style={{ color: "var(--ink-muted)" }}>
                          {new Intl.NumberFormat("ar-EG").format(r.min)}+ نقطة ·{" "}
                          {new Intl.NumberFormat("ar-EG").format(AI_QUOTA_BY_RANK[r.key] ?? 6)} رسائل/مقال
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                        {r.hint}
                        {r.key === "أهل الكلمة" ? " + فتح قناة المقترحات الخاصة." : "."}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. الفرق بين التوثيق الرسمي والعضوية المميزة */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "#15803D" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 1.5l2.5 2.1 3.2-.4 1.2 3 3 1.2-.4 3.2L23.5 12l-2 2.4.4 3.2-3 1.2-1.2 3-3.2-.4L12 23.5l-2.5-2.1-3.2.4-1.2-3-3-1.2.4-3.2L.5 12l2-2.4-.4-3.2 3-1.2 1.2-3 3.2.4L12 1.5z" />
                      <path d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff" />
                    </svg>
                    التوثيق الرسمي (علامة الصح)
                  </p>
                  <p className="mt-2 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                    إثبات رسمي لهوية صاحب الحساب (كاتب رسمي، فرد عائلة موثق، أو نخبة أهل الكلمة). يمنحك بطاقة فكرية موسعة بروابطك، وأولوية في النقاشات، وتخطي فترات التهدئة.
                  </p>
                </div>

                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "#D97706" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
                    </svg>
                    العضوية المميزة (VIP)
                  </p>
                  <p className="mt-2 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                    شارة تقدير وامتيازات خاصة تمنحها الإدارة للمساهمين المتميزين، وقد تشمل: محاورة ذكاء اصطناعي غير محدودة، إطار تعليق مميز، تثبيت تعليقاتك ذاتيًا، أو فتح قناة المقترحات.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
