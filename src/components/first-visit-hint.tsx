"use client";

import { useEffect, useState } from "react";

/**
 * تلميح ذكي هادئ لأول زيارة — يظهر مرة واحدة فقط في كل موضع،
 * بلغة عربية فصحى ميسّرة، وبلا تعتيم للشاشة أو خطوات إجبارية.
 */
export function FirstVisitHint({
  id,
  text,
  className = "",
}: {
  id: string;
  text: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = `kalam_hint_${id}_v1`;

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) {
        setVisible(true);
      }
    } catch {}
  }, [storageKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className={`page-chrome no-print flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-xs shadow-soft animate-fade-in ${className}`}
      style={{
        background: "var(--accent-soft)",
        borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
        color: "var(--ink)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface)", color: "var(--accent-strong)" }}
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.2 1 2h6c0-.8.3-1.5 1-2A7 7 0 0 0 12 2Z" />
          </svg>
        </span>
        <p className="leading-6">{text}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-transform active:scale-95"
        style={{ background: "var(--surface)", color: "var(--accent-strong)" }}
      >
        حسنًا
      </button>
    </div>
  );
}
