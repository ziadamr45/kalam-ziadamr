"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ============================================================
 * نظام النوافذ والتنبيهات الموحد — هوية «كلام له لازمة»
 * ============================================================
 * ConfirmDialog بنمط Promise + Toast لحظي — مرسومان عبر createPortal
 * بورق المنصة الدافئ وذهبيها وشعار الريشة. ممنوع نهائيًا نوافذ
 * المتصفح التقليدية (window.confirm / alert) — كل تأكيد وكل إشعار
 * يمر من هنا فلا يخرج القارئ من أجواء المنصة لحظة واحدة.
 */

type ToastTone = "success" | "error" | "info";
type ConfirmTone = "accent" | "danger";

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (text: string, tone?: ToastTone) => void;
};

type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };
type ToastItem = { id: number; text: string; tone: ToastTone };

const DialogContext = createContext<DialogContextValue>({
  confirm: async () => false,
  toast: () => {},
});

export function useDialogs() {
  return useContext(DialogContext);
}

/* شعار الريشة — توقيع النوافذ الموحدة */
function FeatherMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.2 3.8c-5.8.4-10.5 4-12.5 9.4L3 21l7.9-4.7c5.4-2 9-6.7 9.3-12.5Z" />
      <path d="M6.5 17.5 13 11" />
    </svg>
  );
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (tone === "success") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5m0 3v.1" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8v.1" />
    </svg>
  );
}

const TONE_COLORS: Record<ToastTone, { bar: string; fg: string }> = {
  success: { bar: "#3c7a4e", fg: "#3c7a4e" },
  error: { bar: "#DC2626", fg: "#DC2626" },
  info: { bar: "var(--accent-strong)", fg: "var(--accent-strong)" },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  const toast = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve });
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest((r) => {
      r?.resolve(ok);
      return null;
    });
  }, []);

  /* Escape يلغي دائمًا — لا إجبار ولا حبس */
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    /* التركيز الافتراضي: زر الإلغاء في الخطر، وزر التأكيد في العادي */
    const t = setTimeout(() => {
      if (request.tone === "danger") cancelBtnRef.current?.focus();
      else confirmBtnRef.current?.focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [request, settle]);

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);
  const isDanger = request?.tone === "danger";

  return (
    <DialogContext.Provider value={value}>
      {children}

      {mounted && request &&
        createPortal(
          <div className="fixed inset-0 z-95 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={request.title}>
            <div className="absolute inset-0 bg-zinc-950/62 backdrop-blur-sm animate-fade-in" onClick={() => settle(false)} />
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border shadow-lift animate-fade-in"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              {/* إطار ذهبي داخلي ناعم — توقيع الهوية */}
              <div className="pointer-events-none absolute inset-2 rounded-3xl" style={{ border: "1px solid var(--accent-soft)" }} aria-hidden />

              <div className="relative px-7 pb-6 pt-8 text-center">
                <div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{
                    background: isDanger ? "rgba(180,68,60,0.10)" : "var(--accent-soft)",
                    color: isDanger ? "#b4443c" : "var(--accent-strong)",
                  }}
                  aria-hidden
                >
                  <FeatherMark />
                </div>
                <h3 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {request.title}
                </h3>
                <p className="mt-3 text-[13px] leading-7" style={{ color: "var(--ink-muted)" }}>
                  {request.body}
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    ref={cancelBtnRef}
                    onClick={() => settle(false)}
                    className="rounded-full px-5 py-2.5 text-xs font-bold transition-transform active:scale-[0.97]"
                    style={{ background: "var(--bg-soft)", color: "var(--ink-muted)" }}
                  >
                    {request.cancelLabel ?? "تراجع"}
                  </button>
                  <button
                    ref={confirmBtnRef}
                    onClick={() => settle(true)}
                    className="rounded-full px-5 py-2.5 text-xs font-bold text-white transition-transform active:scale-[0.97]"
                    style={{ background: isDanger ? "#b4443c" : "var(--accent)" }}
                  >
                    {request.confirmLabel ?? "تأكيد"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {mounted && toasts.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed bottom-6 left-4 z-100 flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2 sm:left-6" aria-live="polite">
            {toasts.map((t) => {
              const c = TONE_COLORS[t.tone];
              return (
                <div
                  key={t.id}
                  className="pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-lift"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderInlineStartWidth: 3,
                    borderInlineStartColor: c.bar,
                  }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: c.fg }} aria-hidden>
                    <ToneIcon tone={t.tone} />
                  </span>
                  <p className="text-xs font-bold leading-6" style={{ color: "var(--ink)" }}>
                    {t.text}
                  </p>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}
