"use client";

import { useEffect, useState } from "react";

export type HintStep = {
  title: string;
  text: string;
};

/**
 * دليل تفاعلي مصغّر لأول زيارة — يظهر مرة واحدة فقط عند دخول الميزة لأول مرة،
 * بخطوات واضحة (التالي / فهمت / تخطي) وبلا تعتيم مزعج للشاشة،
 * وبعربية فصحى ميسّرة تناسب جميع القراء.
 */
export function FirstVisitHint({
  id,
  steps,
  text,
  className = "",
}: {
  id: string;
  steps?: HintStep[];
  text?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const storageKey = `kalam_hint_${id}_v2`;

  const resolvedSteps: HintStep[] =
    steps && steps.length > 0
      ? steps
      : text
        ? [{ title: "لمحة سريعة", text }]
        : [];

  useEffect(() => {
    if (resolvedSteps.length === 0) return;
    try {
      if (!window.localStorage.getItem(storageKey)) {
        setVisible(true);
      }
    } catch {}
  }, [storageKey, resolvedSteps.length]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
  };

  if (!visible || resolvedSteps.length === 0) return null;

  const current = resolvedSteps[stepIdx] ?? resolvedSteps[0];
  const isLast = stepIdx >= resolvedSteps.length - 1;
  const arNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

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
