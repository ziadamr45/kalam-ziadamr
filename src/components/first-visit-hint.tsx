"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type HintStep = {
  title: string;
  text: string;
  /** معرّف CSS للعنصر المستهدف عند تفعيل الجولة التفاعلية الموجهة */
  selector?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

/** البحث عن أول عنصر ظاهر فعليًا يطابق الـ selector (لتجاوز النسخ المخفية بين الهاتف والحاسوب) */
function findVisibleTarget(selector: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(selector);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** التحقق إن كان العنصر أو أحد أسلافه مثبّتًا (position: fixed) */
function isFixedElement(el: HTMLElement): boolean {
  let curr: HTMLElement | null = el;
  while (curr && curr !== document.body) {
    const pos = window.getComputedStyle(curr).position;
    if (pos === "fixed") return true;
    curr = curr.parentElement;
  }
  return false;
}

/**
 * دليل التلميحات الذكية المزدوج:
 * 1. الوضع الثابت (`mode="inline"`): بطاقة إرشادية هادئة في موضعها للميزات البسيطة.
 * 2. الوضع التفاعلي الموجه (`mode="tour"`): جولة خطوة بخطوة تنتقل مع القارئ
 *    بين العناصر الفعلية الظاهرة (`selector`) مع تمرير سلس وإطار تسليط ضوء نحاسي،
 *    وعودة هادئة لأعلى الصفحة عند الانتهاء.
 */
export function FirstVisitHint({
  id,
  steps,
  text,
  mode = "inline",
  active = true,
  className = "",
}: {
  id: string;
  steps?: HintStep[];
  text?: string;
  mode?: "inline" | "tour";
  active?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const storageKey = mode === "tour" ? `kalam_tour_${id}_v4` : `kalam_hint_${id}_v2`;

  const resolvedSteps = useMemo<HintStep[]>(
    () =>
      steps && steps.length > 0
        ? steps
        : text
          ? [{ title: "لمحة سريعة", text }]
          : [],
    [steps, text],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active || resolvedSteps.length === 0) return;
    try {
      if (!window.localStorage.getItem(storageKey)) {
        const t = setTimeout(() => {
          setStepIdx(0);
          setVisible(true);
        }, 380);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [active, storageKey, resolvedSteps.length]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setRect(null);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
    if (mode === "tour" && typeof window !== "undefined" && window.scrollY > 80) {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    }
  }, [storageKey, mode]);

  const measureTarget = useCallback(
    (shouldScroll: boolean) => {
      if (!visible || mode !== "tour" || !active) return;
      const step = resolvedSteps[stepIdx];
      if (!step?.selector) {
        setRect(null);
        return;
      }
      const el = findVisibleTarget(step.selector);
      if (!el) {
        if (stepIdx < resolvedSteps.length - 1) {
          setStepIdx((i) => i + 1);
        } else {
          dismiss();
        }
        return;
      }
      if (shouldScroll) {
        try {
          if (isFixedElement(el)) {
            /* عناصر الهيدر العلوي فقط تعيد الصفحة للأعلى لتظهر؛
               أما الشريط السفلي المثبت فيبقى في موضعه دون قفز للأعلى */
            const inTopHeader = Boolean(el.closest("header")) || el.getBoundingClientRect().top < 120;
            if (inTopHeader && window.scrollY > 80) {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          } else {
            const box = el.getBoundingClientRect();
            const vh = window.innerHeight || 800;
            /* العناصر الطويلة جدًا (كجسم المقال) نمرر لبدايتها بدل منتصفها حتى لا نقفز لنصف المقال */
            if (box.height > vh * 0.65) {
              if (box.top < 60 || box.top > vh * 0.6) {
                el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
              }
            } else {
              el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }
          }
        } catch {}
      }
      const update = () => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          setRect(null);
          return;
        }
        const vh = window.innerHeight || 800;
        /* تقليم ارتفاع الإطار للعناصر الطويلة جدًا ليبقى أنيقًا داخل الشاشة */
        const clampedTop = Math.max(8, r.top);
        const clampedHeight = Math.min(r.height, vh - clampedTop - 88);
        setRect({
          top: r.height > vh * 0.65 ? clampedTop : r.top,
          left: r.left,
          width: r.width,
          height: r.height > vh * 0.65 ? Math.max(120, clampedHeight) : r.height,
        });
      };
      update();
      if (shouldScroll) {
        const t = setTimeout(update, 360);
        return () => clearTimeout(t);
      }
    },
    [visible, mode, active, resolvedSteps, stepIdx, dismiss],
  );

  useEffect(() => {
    if (!visible || mode !== "tour" || !active) return;
    const cleanup = measureTarget(true);
    const onUpdate = () => measureTarget(false);
    window.addEventListener("scroll", onUpdate, { passive: true, capture: true });
    window.addEventListener("resize", onUpdate, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (typeof cleanup === "function") cleanup();
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, mode, active, measureTarget, dismiss]);

  if (!visible || !active || resolvedSteps.length === 0) return null;

  const current = resolvedSteps[stepIdx] ?? resolvedSteps[0];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx >= resolvedSteps.length - 1;
  const arNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

  if (mode === "tour") {
    if (!mounted) return null;

    const vw = typeof window !== "undefined" ? window.innerWidth : 390;
    const vh = typeof window !== "undefined" ? window.innerHeight : 844;
    const cardWidth = Math.min(340, vw - 24);
    const pad = 6;

    let cardTop = Math.max(16, vh / 2 - 90);
    let cardLeft = Math.max(12, (vw - cardWidth) / 2);

    if (rect) {
      const targetCenterY = rect.top + rect.height / 2;
      const preferAbove = targetCenterY > vh * 0.52;
      const estimatedCardHeight = 175;
      if (preferAbove) {
        cardTop = Math.max(12, rect.top - estimatedCardHeight - 14);
      } else {
        cardTop = Math.min(vh - estimatedCardHeight - 12, rect.top + rect.height + 14);
      }
      const targetCenterX = rect.left + rect.width / 2;
      cardLeft = Math.min(Math.max(12, targetCenterX - cardWidth / 2), vw - cardWidth - 12);
    }

    return createPortal(
      <div className="page-chrome no-print" aria-live="polite">
        {rect && (
          <div
            className="pointer-events-none fixed z-95 rounded-2xl transition-all duration-300"
            style={{
              top: Math.max(4, rect.top - pad),
              left: Math.max(4, rect.left - pad),
              width: Math.min(vw - 8, rect.width + pad * 2),
              height: Math.min(vh - 8, rect.height + pad * 2),
              boxShadow:
                "0 0 0 2.5px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 45%, transparent)",
            }}
            aria-hidden
          />
        )}

        <div
          role="dialog"
          aria-label={current.title}
          className="fixed z-96 rounded-2xl border p-4 text-xs shadow-lift transition-all duration-300 animate-fade-in"
          style={{
            top: cardTop,
            left: cardLeft,
            width: cardWidth,
            background: "var(--surface)",
            borderColor: "var(--accent)",
            color: "var(--ink)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.2 1 2h6c0-.8.3-1.5 1-2A7 7 0 0 0 12 2Z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold" style={{ color: "var(--accent-strong)" }}>
                  {current.title}
                </p>
                {resolvedSteps.length > 1 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--bg-soft)", color: "var(--ink-muted)" }}
                  >
                    {arNum(stepIdx + 1)} من {arNum(resolvedSteps.length)}
                  </span>
                )}
              </div>
              <p className="mt-1.5 leading-6" style={{ color: "var(--ink-muted)" }}>
                {current.text}
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-(--bg-soft)"
              style={{ color: "var(--ink-muted)" }}
            >
              تخطي
            </button>
            <div className="flex items-center gap-1.5">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  className="rounded-full border px-3 py-1 text-[11px] font-bold transition-colors hover:bg-(--bg-soft)"
                  style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                >
                  السابق
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? dismiss() : setStepIdx((i) => i + 1))}
                className="rounded-full px-4 py-1.5 text-[11px] font-bold text-white transition-transform active:scale-95"
                style={{ background: "var(--accent)" }}
              >
                {isLast ? "فهمت" : "التالي"}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      role="status"
      className={`page-chrome no-print rounded-2xl border p-3.5 text-xs shadow-soft animate-fade-in ${className}`}
      style={{
        background: "var(--surface)",
        borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
        color: "var(--ink)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.2 1 2h6c0-.8.3-1.5 1-2A7 7 0 0 0 12 2Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold" style={{ color: "var(--accent-strong)" }}>
                {current.title}
              </p>
              {resolvedSteps.length > 1 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--bg-soft)", color: "var(--ink-muted)" }}
                >
                  {arNum(stepIdx + 1)} من {arNum(resolvedSteps.length)}
                </span>
              )}
            </div>
            <p className="mt-1 leading-6" style={{ color: "var(--ink-muted)" }}>
              {current.text}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {!isLast && (
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-(--bg-soft)"
            style={{ color: "var(--ink-muted)" }}
          >
            تخطي
          </button>
        )}
        <button
          type="button"
          onClick={() => (isLast ? dismiss() : setStepIdx((i) => i + 1))}
          className="rounded-full px-4 py-1.5 text-[11px] font-bold text-white transition-transform active:scale-95"
          style={{ background: "var(--accent)" }}
        >
          {isLast ? "فهمت" : "التالي"}
        </button>
      </div>
    </div>
  );
}
