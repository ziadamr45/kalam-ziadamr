"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * بوابة المصادقة الموحدة للتفاعل الفكري (Authentication Gate):
 * الزائر غير المسجل يقرأ ويتصفح فقط — أي إجراء تفاعلي (نقاش AI، تعليق،
 * تصويت، حفظ) يوقف فورًا ويعرض نافذة دخول ذكية تحتفظ بنية التفاعل،
 * فور اكتمال الدخول يُعاد تنفيذ الإجراء تلقائيًا دون فقدان السياق.
 *
 * الاستخدام في أي مكوّن عميل:
 *   if (!session?.user) { requestAuth({ kind: "vote-article", payload: { value } }); return; }
 */

export type AuthIntentKind = "comment" | "vote-article" | "vote-comment" | "ai-chat" | "save";

export type AuthIntent = {
  kind: AuthIntentKind;
  label?: string;
  payload?: Record<string, unknown>;
};

const INTENT_KEY = "kalam:auth-intent";
const REQ_EVENT = "kalam:auth-required";
export const RUN_EVENT = "kalam:run-intent";

/** استدعِها عند نقر زائر غير مسجل على إجراء تفاعلي — توقف التنفيذ واعرض النافذة */
export function requestAuth(intent: AuthIntent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {}
  window.dispatchEvent(new CustomEvent(REQ_EVENT));
}

/** قراءة نية محفوظة (داخلية) */
function peekIntent(): AuthIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    return raw ? (JSON.parse(raw) as AuthIntent) : null;
  } catch {
    return null;
  }
}

/** اشتراك في تنفيذ النوايا المكتملة — بعد عودة المستخدم من تسجيل الدخول */
export function onAuthIntent(cb: (intent: AuthIntent) => void): () => void {
  const handler = (ev: Event): void => {
    const detail = (ev as CustomEvent<AuthIntent>).detail;
    if (detail?.kind) cb(detail);
  };
  window.addEventListener(RUN_EVENT, handler);
  return () => window.removeEventListener(RUN_EVENT, handler);
}

export function AuthGateModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onReq = (): void => setOpen(true);
    window.addEventListener(REQ_EVENT, onReq);
    return () => window.removeEventListener(REQ_EVENT, onReq);
  }, []);

  /* إغلاق بزر الهروب */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const startSignIn = (): void => {
    /* النية محفوظة في sessionStorage — تعاد تنفيذه تلقائيًا بعد العودة.
       العنوان الحالي يُقرأ لحظة النقر — بلا خطافات توجيه تكسر التمهيد الساكن */
    const current = `${window.location.pathname}${window.location.search}`;
    void signIn("google", { redirectTo: current || "/" });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="انضم لمجتمع الفكر والأثر"
    >
      <div
        className="w-full max-w-md rounded-3xl border p-6 shadow-lift animate-fade-in sm:p-8"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* شعار مصغر */}
        <div className="mb-4 flex justify-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{ background: "var(--accent-soft)" }}
            aria-hidden
          >
            ✦
          </span>
        </div>
        <h2 className="text-center text-xl font-extrabold leading-8" style={{ color: "var(--ink)" }}>
          انضم لمجتمع الفكر والأثر
        </h2>
        <p className="mt-3 text-center text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
          التفاعل الفكري، كتابة التعليقات، التصويت، ومحاورة المقال مع الذكاء الاصطناعي تتطلب حسابًا موثقًا لصناعة أثر حقيقي.
        </p>

        <button
          onClick={startSignIn}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-extrabold transition-transform active:scale-[0.98]"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" opacity=".9" />
            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" opacity=".75" />
            <path fill="#fff" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" opacity=".6" />
            <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" opacity=".9" />
          </svg>
          تسجيل الدخول عبر Google
        </button>

        <button
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-bold transition-colors hover:opacity-80"
          style={{ background: "var(--bg-soft)", color: "var(--ink-muted)" }}
        >
          متابعة القراءة كزائر
        </button>

        <p className="mt-4 text-center text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
          القراءة والتصفح متاحان للزوار دائمًا — والحساب يفتح لك صناعة الأثر ورصيد نقاطك.
        </p>
      </div>
    </div>
  );
}

/** يُركَّب مرة واحدة في Providers — بعد عودة المستخدم من الدخول ينفذ نيته المحفوظة */
export function AuthIntentRunner() {
  useEffect(() => {
    const intent = peekIntent();
    if (!intent) return;
    try {
      sessionStorage.removeItem(INTENT_KEY);
    } catch {}
    /* مهلة قصيرة لترطيب الجلسة والمكوّنات المستمِعة */
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent(RUN_EVENT, { detail: intent }));
    }, 800);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

/** حزمة التركيب الموحدة — نافذة الدخول + منفّذ النوايا */
export function AuthGateOverlay() {
  return (
    <>
      <AuthGateModal />
      <AuthIntentRunner />
    </>
  );
}
