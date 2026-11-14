"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { getVisitorFingerprint } from "@/lib/fingerprint";

type ChatMessage = { role: "user" | "model"; text: string };

/**
 * عارض ماركداون غني لردود المحاور:
 * عناوين (##)، جداول (| ... |)، اقتباسات (> )، قوائم نقطية ومرقمة،
 * عريض (**)، مائل (*)، وسوم (`...`)، وروابط قابلة للضغط ([نص](url) أو https:// أو mailto:).
 */
function MiniMarkdown({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let bullets: string[] = [];
  let ordered = false;
  let quoteLines: string[] = [];
  let tableRows: string[][] = [];

  const renderLinksAndText = (chunk: string, keyPrefix: string): React.ReactNode[] => {
    const pattern = /(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)|https?:\/\/[^\s<>()]+|mailto:[^\s<>()]+)/g;
    const parts = chunk.split(pattern);
    return parts.filter(Boolean).map((part, idx) => {
      const mdMatch = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/);
      if (mdMatch) {
        const [, label, href] = mdMatch;
        return (
          <a
            key={`${keyPrefix}-lnk-${idx}`}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
            className="font-bold underline decoration-2 underline-offset-4 break-words hover:opacity-80"
            style={{ color: "var(--accent-strong)" }}
          >
            {label}
          </a>
        );
      }
      if (/^(https?:\/\/|mailto:)/.test(part)) {
        const cleanUrl = part.replace(/[.,،؛:!?؟)]+$/, "");
        const trailing = part.slice(cleanUrl.length);
        return (
          <span key={`${keyPrefix}-url-${idx}`}>
            <a
              href={cleanUrl}
              target={cleanUrl.startsWith("mailto:") ? undefined : "_blank"}
              rel={cleanUrl.startsWith("mailto:") ? undefined : "noopener noreferrer"}
              dir="ltr"
              className="font-semibold underline underline-offset-4 break-all hover:opacity-80"
              style={{ color: "var(--accent-strong)" }}
            >
              {cleanUrl}
            </a>
            {trailing}
          </span>
        );
      }
      return <span key={`${keyPrefix}-txt-${idx}`}>{part}</span>;
    });
  };

  const inline = (s: string, k: string): React.ReactNode[] =>
    s
      .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
      .filter((p) => p !== "")
      .map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={`${k}-${i}`} className="font-bold">
              {renderLinksAndText(p.slice(2, -2), `${k}-b-${i}`)}
            </strong>
          );
        }
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
          return (
            <em key={`${k}-${i}`} className="italic">
              {renderLinksAndText(p.slice(1, -1), `${k}-em-${i}`)}
            </em>
          );
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <code
              key={`${k}-${i}`}
              className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold break-words"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={`${k}-${i}`}>{renderLinksAndText(p, `${k}-r-${i}`)}</span>;
      });

  const flushList = () => {
    if (bullets.length === 0) return;
    const items = bullets.map((b, i) => (
      <li key={i} className="leading-7 break-words [overflow-wrap:anywhere]">{inline(b, `li${nodes.length}-${i}`)}</li>
    ));
    const Tag = ordered ? "ol" : "ul";
    nodes.push(
      <Tag key={`list-${nodes.length}`} className={`space-y-1 ps-5 ${ordered ? "list-decimal" : "list-disc"}`}>
        {items}
      </Tag>,
    );
    bullets = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    nodes.push(
      <blockquote
        key={`q-${nodes.length}`}
        className="rounded-xl border-r-3 px-3.5 py-2 text-[13px] leading-7 break-words [overflow-wrap:anywhere]"
        style={{
          borderColor: "var(--accent)",
          background: "var(--surface)",
          color: "var(--ink-muted)",
        }}
      >
        {quoteLines.map((ql, i) => (
          <p key={i}>{inline(ql, `q${nodes.length}-${i}`)}</p>
        ))}
      </blockquote>,
    );
    quoteLines = [];
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const header = tableRows[0];
    const body = tableRows.slice(1);
    nodes.push(
      <div key={`tbl-${nodes.length}`} className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full border-collapse text-right text-xs">
          <thead>
            <tr style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
              {header.map((cell, ci) => (
                <th key={ci} className="border-b px-3 py-2 font-bold" style={{ borderColor: "var(--border)" }}>
                  {inline(cell, `th${nodes.length}-${ci}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "var(--surface)" : "transparent" }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border-t px-3 py-2 leading-6" style={{ borderColor: "var(--border)" }}>
                    {inline(cell, `td${nodes.length}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  };

  let para: string[] = [];
  const flushPara = () => {
    if (para.length === 0) return;
    const content = para.map((l, i) => (
      <span key={i}>
        {i > 0 && <br />}
        {inline(l, `p${nodes.length}-${i}`)}
      </span>
    ));
    nodes.push(
      <p key={`p-${nodes.length}`} className="leading-7 break-words [overflow-wrap:anywhere]">{content}</p>,
    );
    para = [];
  };

  const flushAll = () => {
    flushList();
    flushQuote();
    flushTable();
    flushPara();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numItem = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");

    if (isTableLine) {
      flushList();
      flushQuote();
      flushPara();
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      const isSeparator = cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (!isSeparator) tableRows.push(cells);
    } else if (heading) {
      flushAll();
      nodes.push(
        <p
          key={`h-${nodes.length}`}
          className="mt-1 border-b pb-1 text-[13px] font-bold break-words"
          style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}
        >
          {inline(heading[2], `h${nodes.length}`)}
        </p>,
      );
    } else if (quote) {
      flushList();
      flushTable();
      flushPara();
      quoteLines.push(quote[1]);
    } else if (bullet || numItem) {
      flushQuote();
      flushTable();
      flushPara();
      const isNum = Boolean(numItem);
      if (bullets.length > 0 && ordered !== isNum) flushList();
      ordered = isNum;
      bullets.push((bullet ?? numItem)![1]);
    } else if (line.trim() === "") {
      flushAll();
    } else {
      flushList();
      flushQuote();
      flushTable();
      para.push(line);
    }
  }
  flushAll();

  return <div className="space-y-2.5 overflow-hidden">{nodes}</div>;
}

const HISTORY_KEY = (articleId: string) => `kalam_discuss_${articleId}`;

export function DiscussCompanion({
  articleId,
  articleTitle,
}: {
  articleId: string;
  articleTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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
  const [unlimited, setUnlimited] = useState(false);
  const [error, setError] = useState("");
  const [exhausted, setExhausted] = useState(false);
  const [impactNote, setImpactNote] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const { data: session, status } = useSession();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(false);

  const restoreSession = useCallback(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY(articleId));
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
        localStorage.setItem(
          HISTORY_KEY(articleId),
          JSON.stringify({ messages: msgs.slice(-40), remaining: rem }),
        );
      } catch {}
    },
    [articleId],
  );

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ai/discuss?articleId=${encodeURIComponent(articleId)}&fp=${encodeURIComponent(getVisitorFingerprint())}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { remaining: number; limit: number; unlimited?: boolean };
        setRemaining(data.remaining);
        setLimit(data.limit);
        setExhausted(!data.unlimited && data.remaining <= 0);
        setUnlimited(data.unlimited === true || data.remaining > 1_000_000);
      }
    } catch {}
  }, [articleId]);

  const openDrawer = useCallback(() => {
    if (status === "unauthenticated") {
      requestAuth({ kind: "ai-chat" });
      return;
    }
    restoreSession();
    setOpen(true);
    openRef.current = true;
    fetchQuota();
  }, [restoreSession, fetchQuota, status]);

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
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
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
    if (!open || !listRef.current) return;
    const last = messages[messages.length - 1];
    if (!sending && last?.role === "model") {
      const el = listRef.current.querySelector(`[data-msg-idx="${messages.length - 1}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

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

  const plainOf = (t: string) =>
    t
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/^#{1,3}\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^\s*[-*•]\s+/gm, "• ")
      .trim();

  const copyMessage = async (idx: number) => {
    const m = messages[idx];
    if (!m) return;
    try {
      await navigator.clipboard.writeText(plainOf(m.text));
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1600);
    } catch {}
  };

  const startEdit = (idx: number) => {
    const m = messages[idx];
    if (!m || sending) return;
    setActiveIdx(null);
    setEditing(idx);
    setInput(m.text);
    setError("");
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const cancelEdit = () => {
    setEditing(null);
    setInput("");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || exhausted) return;

    setError("");
    setInput("");
    const editIndex = editing;
    setEditing(null);
    setActiveIdx(null);
    const baseMessages = editIndex !== null ? messages.slice(0, editIndex) : messages;
    const nextMessages: ChatMessage[] = [...baseMessages, { role: "user", text }];
    setMessages(nextMessages);
    setSending(true);

    try {
      const res = await fetch("/api/ai/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          message: text,
          fp: getVisitorFingerprint(),
          history: baseMessages.map((m) => ({
            role: m.role === "model" ? "model" : "user",
            text: m.text,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        remaining?: number;
        unlimited?: boolean;
        error?: string;
        exhausted?: boolean;
      };

      if (!res.ok || !data.reply) {
        if (data.exhausted) {
          setExhausted(true);
          setRemaining(0);
          persistSession(baseMessages, 0);
          setError("");
        } else {
          setError(data.error || "تعذر إرسال الرسالة — أعد المحاولة");
        }
        setMessages(baseMessages);
        setInput(text);
        if (editIndex !== null) setEditing(editIndex);
        return;
      }

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { role: "model", text: data.reply },
      ];
      const rem = typeof data.remaining === "number" ? data.remaining : null;
      setMessages(finalMessages);
      if (data.unlimited === true || (rem !== null && rem > 1_000_000)) setUnlimited(true);
      if (rem !== null) {
        setRemaining(rem);
        if (rem <= 0 && data.unlimited !== true) setExhausted(true);
      }
      persistSession(finalMessages, rem);

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
      setMessages(baseMessages);
      setInput(text);
      if (editIndex !== null) setEditing(editIndex);
    } finally {
      setSending(false);
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    /* الإرسال بـ Enter فقط على الأجهزة ذات لوحة المفاتيح الفعلية والمؤشر الدقيق؛
       على الهواتف والأجهزة اللوحية يضيف زر الإدخال سطرًا جديدًا بشكل طبيعي */
    const isDesktopKeyboard =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!isDesktopKeyboard) return;
    e.preventDefault();
    send();
  };

  const arabicNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
  const ready = mounted && open;

  return (
    <>
      <div className="page-chrome no-print mt-8 flex justify-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={openDrawer}
          data-tour="discuss-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="group flex items-center gap-2.5 rounded-full px-6 py-3 text-sm font-bold shadow-soft transition-all hover:scale-105 focus:outline-hidden focus-visible:ring-2"
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

      <div
        className={`fixed inset-0 z-70 ${ready ? "" : "pointer-events-none"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`نقاش فكري حول: ${articleTitle}`}
        aria-hidden={!ready}
      >
        <div
          onClick={closeDrawer}
          className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          className={`absolute inset-y-0 left-0 flex w-full flex-col shadow-2xl transition-all duration-300 ease-out ${
            fullscreen ? "max-w-full" : "max-w-md"
          } ${ready ? "translate-x-0" : "-translate-x-full"}`}
          style={{ background: "var(--surface)" }}
        >
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
            <div className="flex shrink-0 items-center gap-1.5">
              {impactNote && (
                <span
                  className="hidden rounded-full px-3 py-1 text-[11px] font-bold sm:inline"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                  title="سُجّل في رصيد أثرك الفكري"
                >
                  ✦ {impactNote}
                </span>
              )}
              {unlimited || (remaining !== null && remaining > 1_000_000) ? (
                <span
                  data-tour="discuss-quota"
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "rgba(245, 158, 11, 0.1)",
                    color: "#D97706",
                    borderColor: "rgba(245, 158, 11, 0.25)",
                  }}
                  title="وصول سيادي بلا حصة — رتبة مميزة على المنصة"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
                  </svg>
                  وصول غير محدود
                </span>
              ) : (
                remaining !== null && (
                  <span
                    data-tour="discuss-quota"
                    className="rounded-full px-3 py-1 text-[11px] font-bold tabular-nums"
                    style={{
                      background: "var(--bg-soft)",
                      color: remaining <= 1 ? "#DC2626" : "var(--ink-muted)",
                    }}
                    title="الرسائل المتبقية في حصة هذا المقال — تتمدد حصتك مع ترقية رتبتك"
                  >
                    متبقٍ {arabicNum(remaining)} من {arabicNum(limit)}
                  </span>
                )
              )}
              {/* زر ملء الشاشة للتابلت والكمبيوتر (الهاتف يملأ الشاشة افتراضيًا) */}
              <button
                type="button"
                onClick={() => setFullscreen((f) => !f)}
                aria-label={fullscreen ? "تصغير نافذة النقاش" : "توسيع نافذة النقاش لملء الشاشة"}
                title={fullscreen ? "الوضع الجانبي" : "ملء الشاشة"}
                className="hidden rounded-full p-2 transition-colors hover:bg-(--accent-soft) sm:inline-flex"
                style={{ color: fullscreen ? "var(--accent-strong)" : "var(--ink-muted)" }}
              >
                {fullscreen ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="إغلاق النقاش"
                className="rounded-full p-2 transition-colors hover:bg-(--accent-soft)"
                style={{ color: "var(--ink-muted)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3.5 sm:p-4" aria-live="polite">
            <div className={`space-y-4 ${fullscreen ? "mx-auto max-w-3xl" : ""}`}>
              <FirstVisitHint
                id="ai-discuss"
                mode="tour"
                active={ready}
                steps={[
                  {
                    selector: "[data-tour='discuss-input']",
                    title: "من هنا تبدأ الحوار",
                    text: "اكتب سؤالك أو فكرتك بالعربية الفصحى أو العامية أو الإنجليزية، وسيرد عليك المحاور من صلب المقال.",
                  },
                  {
                    selector: "[data-tour='discuss-send']",
                    title: "إرسال رسالتك",
                    text: "اضغط هنا لإرسال سؤالك؛ وعلى الهاتف يضيف زر الإدخال في لوحة المفاتيح سطرًا جديدًا دون إرسال.",
                  },
                  {
                    selector: "[data-tour='discuss-quota']",
                    title: "حصتك في النقاش",
                    text: "هنا تتابع عدد الرسائل المتبقية لك في هذا المقال — وتتوسع حصتك كلما ارتفعت رتبتك.",
                  },
                ]}
              />

              <div className="flex justify-start">
                <div
                  className="w-fit max-w-[92%] overflow-hidden whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-7 break-words [overflow-wrap:anywhere]"
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
                <div key={i} data-msg-idx={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="min-w-0 max-w-[92%]">
                    <div
                      onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                      className={`w-fit max-w-full cursor-pointer overflow-hidden rounded-2xl px-4 py-3 text-sm leading-7 break-words [overflow-wrap:anywhere] ${
                        m.role === "user" ? "whitespace-pre-wrap rounded-tl-sm" : "rounded-tr-sm"
                      }`}
                      style={
                        m.role === "user"
                          ? { background: "var(--accent)", color: "#fff" }
                          : { background: "var(--bg-soft)", color: "var(--ink)", border: "1px solid var(--border)" }
                      }
                      title="اضغط لإظهار الإجراءات"
                    >
                      {m.role === "model" ? <MiniMarkdown text={m.text} /> : m.text}
                    </div>
                    {activeIdx === i && !sending && (
                      <div
                        className={`mt-1 flex items-center gap-3 text-[11px] font-bold ${
                          m.role === "user" ? "justify-end" : ""
                        }`}
                      >
                        {m.role === "model" ? (
                          <button
                            type="button"
                            onClick={() => copyMessage(i)}
                            className="flex items-center gap-1 transition-colors hover:opacity-80"
                            style={{ color: copiedIdx === i ? "var(--accent-strong)" : "var(--ink-muted)" }}
                          >
                            {copiedIdx === i ? (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                                نُسخ الرد
                              </>
                            ) : (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                نسخ الرد
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(i)}
                            className="flex items-center gap-1 transition-colors hover:opacity-80"
                            style={{ color: "var(--ink-muted)" }}
                            title="عدّل رسالتك — يُقصّ الحوار بعد هذه الرسالة وتُحسب من رصيدك كرسالة جديدة"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                            تعديل
                          </button>
                        )}
                      </div>
                    )}
                    {editing === i && (
                      <p className="mt-1 text-[10px] font-semibold leading-4" style={{ color: "#D97706" }}>
                        وضع التعديل — أرسل النص الجديد وسيُحذف ما بعد هذه الرسالة
                      </p>
                    )}
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

              {exhausted && !unlimited && (
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
          </div>

          <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
            <div className={fullscreen ? "mx-auto max-w-3xl" : ""}>
              {editing !== null && (
                <div
                  className="mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold"
                  style={{
                    borderColor: "rgba(245,158,11,0.4)",
                    background: "rgba(245,158,11,0.08)",
                    color: "#D97706",
                  }}
                >
                  <span>أنت تعدّل رسالة سابقة — إرسالها يحذف ما بعدها وتُحسب من رصيدك كرسالة جديدة</span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="shrink-0 font-bold underline underline-offset-2"
                  >
                    إلغاء
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  data-tour="discuss-input"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setError("");
                  }}
                  onKeyDown={onInputKey}
                  enterKeyHint="enter"
                  rows={1}
                  disabled={exhausted || sending}
                  maxLength={1200}
                  placeholder={
                    exhausted
                      ? "انتهت حصة النقاش لهذا المقال"
                      : editing !== null
                        ? "عدّل رسالتك ثم أرسل.."
                        : "اسأل أو ناقش بهدوء واحترام.."
                  }
                  className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border bg-transparent p-3 text-sm leading-7 outline-hidden transition-colors focus:border-(--accent) disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                />
                <button
                  type="button"
                  data-tour="discuss-send"
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
              <p className="select-none py-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
                {cfgDisclaimer}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
