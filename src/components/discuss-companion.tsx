"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";
import { getVisitorFingerprint } from "@/lib/fingerprint";

/**
 * الرفيق الفكري للمقال — «ناقش أفكار المقال»
 * زر انسيابي يفتح نافذة جانبية ناعمة (Slide-over) لتبادل الرسائل
 * دون حجب نص المقال عن عيني القارئ، مع عداد هادئ للحصة المتبقية.
 * الحصة الصارمة مفروضة من الخادم (٦ رسائل لكل قارئ في كل مقال) — الواجهة مرآة فقط.
 */

type ChatMessage = { role: "user" | "model"; text: string };

const HISTORY_KEY = (articleId: string) => `kalam_discuss_${articleId}`;

export function DiscussCompanion({
  articleId,
  articleTitle,
}: {
  articleId: string;
  articleTitle: string;
}) {
  const [open, setOpen] = useState(false);
  /* التكوين السيادي: شارة المحاور ورسالته الافتتاحية وتنويهه الثابت */
  const [cfgBadge, setCfgBadge] = useState("مساعد ذكاء اصطناعي");
  const [cfgOpening, setCfgOpening] = useState(
    "أنا هنا لأحاورك حول الأفكار الواردة في هذا المقال ومساعدتك في تحليلها واستخراج أبعادها.",
  );
  const [cfgDisclaimer, setCfgDisclaimer] = useState(
    "المحاور هو نموذج ذكاء اصطناعي تحليلي، وقد تقع منه أخطاء أو تأويلات؛ يُرجى الرجوع لمتن المقال والمصادر الأصلية دائمًا.",
  );
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number>(6);
  const [error, setError] = useState("");
  const [exhausted, setExhausted] = useState(false);
  const [impactNote, setImpactNote] = useState("");
  const { data: session, status } = useSession();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(false);

  /* استعادة الحوار من الجلسة الحالية (الخادم يبقى الحَكَم في الحصة) */
  const restoreSession = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY(articleId));
      if (raw) {
        const saved = JSON.parse(raw) as { messages: ChatMessage[]; remaining: number };
        if (Array.isArray(saved.messages)) setMessages(saved.messages.slice(-40));
        if (typeof saved.remaining === "number") setRemaining(saved.remaining);
      }
    } catch {}
  }, [articleId]);

  const persistSession = useCallback(
    (msgs: ChatMessage[], rem: number | null) => {
      try {
        sessionStorage.setItem(
          HISTORY_KEY(articleId),
          JSON.stringify({ messages: msgs.slice(-40), remaining: rem }),
        );
      } catch {}
    },
    [articleId],
  );

  /* جلب الحصة من الخادم عند كل فتح — مصدر الحقيقة */
  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ai/discuss?articleId=${encodeURIComponent(articleId)}&fp=${encodeURIComponent(getVisitorFingerprint())}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { remaining: number; limit: number };
        setRemaining(data.remaining);
        setLimit(data.limit);
        setExhausted(data.remaining <= 0);
      }
    } catch {}
  }, [articleId]);

  const openDrawer = useCallback(() => {
    /* بوابة المصادقة: محاورة المقال مع الذكاء الاصطناعي للأعضاء المسجلين حصرًا */
    if (status === "unauthenticated") {
      requestAuth({ kind: "ai-chat" });
      return;
    }
    restoreSession();
    setOpen(true);
    openRef.current = true;
    fetchQuota();
  }, [restoreSession, fetchQuota, status]);

  /* تنفيذ النية المحفوظة — عاد المستخدم من الدخول ليفتح النقاش تلقائيًا */
  const openDrawerRef = useRef(openDrawer);
  useEffect(() => {
    openDrawerRef.current = openDrawer;
  });
  useEffect(
    () =>
      onAuthIntent((intent) => {
        if (intent.kind === "ai-chat") openDrawerRef.current();
      }),
    [],
  );

  const closeDrawer = useCallback(() => {
    setOpen(false);
    openRef.current = false;
    setError("");
    /* إعادة التركيز للزر بعد الإغلاق */
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  /* تهيئة الهجوم على أعلى القائمة عند رسالة جديدة */
  useEffect(() => {
    /* جلب حزمة التكوين السيادي — نصوص المحاور يحكمها الأدمن لحظيًا */
    fetch("/api/public-config")
      .then((r) => r.json())
      .then((c: { DISCUSS_BADGE?: string; DISCUSS_OPENING?: string; DISCUSS_DISCLAIMER?: string }) => {
        if (c?.DISCUSS_BADGE) setCfgBadge(c.DISCUSS_BADGE);
        if (c?.DISCUSS_OPENING) setCfgOpening(c.DISCUSS_OPENING);
        if (c?.DISCUSS_DISCLAIMER) setCfgDisclaimer(c.DISCUSS_DISCLAIMER);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  /* قفل تمرير الصفحة خلف الـ Drawer + إغلاق بزر Esc + تركيز حقل الكتابة */
  useEffect(() => {
    setMounted(true);
    if (!open) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, closeDrawer]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || exhausted) return;

    setError("");
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setSending(true);

    try {
      const res = await fetch("/api/ai/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* سياق الحوار متعدد الأدوار: كامل السجل التراكمي (user/model) بترتيبه الزمني —
           دون الرسالة الحالية التي تُرسل في حقل message منفصلة
           (مطابقة لدلالة sendMessage الرسمية: history + رسالة جديدة) */
        body: JSON.stringify({
          articleId,
          message: text,
          fp: getVisitorFingerprint(),
          history: messages.map((m) => ({
            role: m.role === "model" ? "model" : "user",
            text: m.text,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        remaining?: number;
        error?: string;
        exhausted?: boolean;
      };

      if (!res.ok || !data.reply) {
        if (data.exhausted) {
          setExhausted(true);
          setRemaining(0);
          persistSession(nextMessages, 0);
          setError("");
        } else {
          setError(data.error || "تعذر إرسال الرسالة — أعد المحاولة");
          /* إرجاع رسالة المستخدم لإعادة الإرسال */
          setMessages(messages);
          setInput(text);
        }
        return;
      }

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { role: "model", text: data.reply },
      ];
      const rem = typeof data.remaining === "number" ? data.remaining : null;
      setMessages(finalMessages);
      if (rem !== null) {
        setRemaining(rem);
        if (rem <= 0) setExhausted(true);
      }
      persistSession(finalMessages, rem);

      /* ============ خطاف «النقاش الفكري العميق» +5 أثر ============
         تُمنح مرة واحدة لكل مقال عند بلوغ الحوار ثالث رسالة مسترسلة
         للمستخدم المسجل (حوار كامل مثمر لا سؤال عابر). */
      const userTurns = finalMessages.filter((m) => m.role === "user").length;
      if (session?.user?.id && userTurns === 3) {
        try {
          const ir = await fetch("/api/impact/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionType: "AI_DISCUSS", articleId, userTurns }),
          });
          const idata = await ir.json().catch(() => null);
          if (idata?.awarded) setImpactNote(`+${idata.points} رصيد أثر لحوارك المثمر`);
        } catch {}
      }
    } catch {
      setError("انقطع الاتصال — أعد المحاولة");
      setMessages(messages);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const arabicNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
  const ready = mounted && open;

  return (
    <>
      {/* الزر الانسيابي الأنيق */}
      <div className="page-chrome no-print mt-8 flex justify-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={openDrawer}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="group flex items-center gap-2.5 rounded-full px-6 py-3 text-sm font-bold shadow-soft transition-all hover:scale-105 focus:outline-none focus-visible:ring-2"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
            border: "1px solid var(--accent)",
          }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          ناقش أفكار المقال
        </button>
      </div>

      {/* النافذة الجانبية الناعمة */}
      <div
        className={`fixed inset-0 z-[70] ${ready ? "" : "pointer-events-none"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`نقاش فكري حول: ${articleTitle}`}
        aria-hidden={!ready}
      >
        {/* الشفّاح الخفيف — النص يظل مقروءًا خلفه */}
        <div
          onClick={closeDrawer}
          className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          className={`absolute inset-y-0 left-0 flex w-full max-w-md flex-col shadow-2xl transition-transform duration-300 ease-out ${
            ready ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "var(--surface)" }}
        >
          {/* الترويسة — عنوان + شارة هوية الذكاء الاصطناعي (شفافية كاملة) */}
          <header
            className="flex items-start justify-between gap-3 border-b p-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-ui text-sm font-bold" style={{ color: "var(--ink)" }}>
                  محاورة المقال فكريًا
                </p>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent-strong)",
                    borderColor: "var(--accent)",
                  }}
                  title="تحاور نموذج ذكاء اصطناعي تحليلي مبنيًا على متن هذا المقال"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
                  </svg>
                  {cfgBadge}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs" style={{ color: "var(--ink-muted)" }}>
                {articleTitle}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {impactNote && (
                <span
                  className="hidden rounded-full px-3 py-1 text-[11px] font-bold sm:inline"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                  title="سُجّل في رصيد أثرك الفكري"
                >
                  ✦ {impactNote}
                </span>
              )}
              {remaining !== null && (
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-bold tabular-nums"
                  style={{
                    background: "var(--bg-soft)",
                    color: remaining <= 1 ? "#DC2626" : "var(--ink-muted)",
                  }}
                  title="الرسائل المتبقية في حصة هذا المقال — تتمدد حصتك مع ترقية رتبتك"
                >
                  متبقٍ {arabicNum(remaining)} من {arabicNum(limit)}
                </span>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="إغلاق النقاش"
                className="rounded-full p-2 transition-colors hover:bg-[var(--accent-soft)]"
                style={{ color: "var(--ink-muted)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          {/* سجل الحوار */}
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {/* الرسالة الافتتاحية الهادئة — هوية المحاور واضحة منذ أول لحظة */}
            <div className="flex justify-start">
              <div
                className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-7"
                style={{ background: "var(--bg-soft)", color: "var(--ink)", border: "1px solid var(--border)" }}
              >
                {cfgOpening}
              </div>
            </div>

            {messages.length === 0 && (
              <div
                className="mt-2 rounded-2xl border border-dashed p-5 text-center text-sm leading-8"
                style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
              >
                اسأل عن أي فكرة في المقال — سأحاورك بفكر الكاتب نفسه.
                <br />
                النقاش محصور بهذا المقال وحده.
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${
                    m.role === "user" ? "rounded-tl-sm" : "rounded-tr-sm"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--bg-soft)", color: "var(--ink)", border: "1px solid var(--border)" }
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-1.5 rounded-2xl rounded-tr-sm px-4 py-3.5"
                  style={{ background: "var(--bg-soft)", border: "1px solid var(--border)" }}
                  aria-label="المحاور يفكر"
                >
                  <span className="kalam-dot" />
                  <span className="kalam-dot kalam-dot-mid" />
                  <span className="kalam-dot kalam-dot-end" />
                </div>
              </div>
            )}

            {exhausted && (
              <p
                className="rounded-2xl border border-dashed p-4 text-center text-xs leading-7"
                style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
              >
                لقد استوفيت الحد المخصص لنقاش هذا المقال ({arabicNum(limit - Math.max(remaining ?? 0, 0))}/{arabicNum(limit)}).
                <br />
                تفضل بزيارة مقال آخر لفتح نقاش جديد — شكرًا لحوارك الراقي.
              </p>
            )}

            {error && (
              <p className="text-center text-xs font-semibold" style={{ color: "#DC2626" }} role="alert">
                {error}
              </p>
            )}
          </div>

          {/* حقل الكتابة */}
          <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError("");
                }}
                onKeyDown={onInputKey}
                rows={1}
                disabled={exhausted || sending}
                maxLength={1200}
                placeholder={
                  exhausted ? "انتهت حصة النقاش لهذا المقال" : "اسأل أو ناقش بهدوء واحترام.."
                }
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border bg-transparent p-3 text-sm leading-7 outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--ink)" }}
              />
              <button
                type="button"
                onClick={send}
                disabled={exhausted || sending || !input.trim()}
                aria-label="إرسال الرسالة"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-soft transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {sending ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="-scale-x-100">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                  </svg>
                )}
              </button>
            </div>
            {/* شريط التنويه السفلي الثابت — هوية المحاور وأمانة الإحالة */}
            <p className="select-none py-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {cfgDisclaimer}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
