"use client";

import { useState } from "react";

/**
 * قناة «أهل الكلمة» — نموذج إرسال المقترحات والموضوعات الفكرية الخاصة
 * مباشرة إلى الأدمن، حصريًا لأصحاب أعلى رتبة فكرية (350 نقطة أثر فأكثر).
 */
export function ProposalForm() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = title.trim().length >= 5 && content.trim().length >= 50;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error || "تعذر إرسال المقترح" });
        return;
      }
      setTitle("");
      setContent("");
      setOpen(false);
      setMessage({ ok: true, text: "وصل مقترحك مباشرة إلى مكتب صاحب المنصة — شكرًا لثقتك" });
    } catch {
      setMessage({ ok: false, text: "انقطع الاتصال — أعد المحاولة" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-3xl border p-6 shadow-soft sm:p-8"
      style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-ui flex items-center gap-2 text-lg font-bold" style={{ color: "var(--accent-strong)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
            </svg>
            قناة «أهل الكلمة»
          </h2>
          <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
            رتبتك تمنحك صوتًا خاصًا: أرسل موضوعاتك ومقترحاتك الفكرية مباشرة إلى صاحب المنصة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-5 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {open ? "إخفاء النموذج" : "اكتب مقترحًا"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="عنوان المقترح — موضوع فكري، سؤال عميق، أو اقتراح تطوير"
            className="w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--ink)", background: "var(--surface)" }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="طوّر فكرتك هنا (50 حرفًا على الأقل).. ما الذي يستحق أن تُناقشه منصة «كلام له لازمة»؟"
            className="w-full resize-none rounded-xl border bg-transparent px-4 py-3 text-sm leading-8 outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--ink)", background: "var(--surface)" }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !valid}
              className="rounded-full px-6 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {busy ? "جارٍ الإرسال.." : "إرسال مباشر للأدمن"}
            </button>
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              خاص تمامًا — لا يراه سوى صاحب المنصة
            </span>
          </div>
        </div>
      )}

      {message && (
        <p
          className="mt-4 rounded-xl px-4 py-3 text-xs font-bold leading-6"
          style={{
            background: message.ok ? "rgba(60,122,78,0.1)" : "rgba(220,38,38,0.08)",
            color: message.ok ? "#3c7a4e" : "#DC2626",
          }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
