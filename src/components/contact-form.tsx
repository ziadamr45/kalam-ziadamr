"use client";

import { useState } from "react";

/* رسالة التحقق المعتمدة — نفس صياغة السيرفر حرفيًا */
const VALIDATION_MESSAGE =
  "الاسم والرسالة حقلان إلزاميان، ويشترط أن تكون رسالتك أطول من سطر واحد؛ ليثمر حوارك نفعًا.";

/* مواضيع سريعة — نقرة واحدة تعبئ الموضوع */
const QUICK_TOPICS = [
  "اقتراح تطوير",
  "ملاحظة على مقال",
  "طلب محو حسابي وبياناتي نهائيًا",
  "كلمة طيبة للإدارة",
];

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [honey, setHoney] = useState(""); // فخ السبام — حقل مخفي عن البشر
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;

    /* فحص المعايير المعتمدة قبل الإرسال: الاسم إجباري،
       والرسالة سطران فأكثر أو 50 حرفًا على الأقل، والبريد اختياري */
    const trimmedName = name.trim();
    const trimmedBody = body.trim();
    const contentLines = trimmedBody.split("\n").filter((l) => l.trim().length > 0).length;
    if (trimmedName.length < 2 || (contentLines < 2 && trimmedBody.length < 50)) {
      setErrorMsg(VALIDATION_MESSAGE);
      setState("error");
      return;
    }

    setState("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, body, honey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error ?? "تعذر إرسال الرسالة — جرّب بعد قليل");
        setState("error");
        return;
      }
      setState("sent");
      setName("");
      setEmail("");
      setSubject("");
      setBody("");
    } catch {
      setErrorMsg("انقطع الاتصال — تحقق من شبكتك وجرّب مرة أخرى");
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <div
        className="rounded-3xl border p-8 text-center shadow-soft"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: "var(--accent-soft)" }}
        >
          ✓
        </div>
        <h2 className="font-ui mt-5 text-lg font-bold" style={{ color: "var(--ink)" }}>
          وصلت رسالتك إلى الإدارة مباشرة
        </h2>
        <p className="mt-3 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
          شكرًا لوقتك.. سيطّلع صاحب المنصة على رسالتك من لوحة التحكم
          ويرد عليك إن تركت بريدًا للتواصل.
        </p>
        <button
          onClick={() => setState("idle")}
          className="mt-6 rounded-2xl border px-6 py-3 text-sm font-bold transition-all hover:scale-[1.02]"
          style={{ borderColor: "var(--border)", color: "var(--ink)" }}
        >
          إرسال رسالة أخرى
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border bg-transparent px-4 py-3 text-sm leading-7 outline-none transition-colors focus:border-[var(--accent)]";

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border p-5 shadow-soft sm:p-7"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* فخ السبام */}
      <input
        type="text"
        value={honey}
        onChange={(e) => setHoney(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
            الاسم *
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputCls}
            style={{ borderColor: "var(--border)", color: "var(--ink)" }}
            placeholder="اسمك الكريم"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
            البريد الإلكتروني (اختياري — للرد عليك)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            dir="ltr"
            className={inputCls}
            style={{ borderColor: "var(--border)", color: "var(--ink)" }}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
          الموضوع
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {QUICK_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSubject(t)}
              className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all hover:scale-[1.03]"
              style={{
                borderColor: subject === t ? "var(--accent)" : "var(--border)",
                color: subject === t ? "var(--accent-strong)" : "var(--ink-muted)",
                background: subject === t ? "var(--accent-soft)" : "transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          className={inputCls}
          style={{ borderColor: "var(--border)", color: "var(--ink)" }}
          placeholder="اقتراح.. ملاحظة.. أو كلمة طيبة"
        />
        {subject === "طلب محو حسابي وبياناتي نهائيًا" && (
          <p className="mt-2 rounded-xl px-3.5 py-2.5 text-[11px] leading-6" style={{ background: "var(--accent-soft)", color: "var(--ink)" }}>
            لتقديم طلب المحو: اكتب في الرسالة بريد حسابك المسجّل وعبارة تأكيد واضحة، وسينفّذ صاحب المنصة
            المحو البرمجي الشامل موثقًا بالسبب خلال مدة لا تتجاوز ١٤ يومًا من الطلب. ولمحو أسرع فوري،
            يمكنك حذف حسابك بنفسك من صفحة «ملفي» — المحو هناك لحظي وبرمجي بلا انتظار.
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
          الرسالة *
        </label>
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={3000}
          className={`${inputCls} resize-none`}
          style={{ borderColor: "var(--border)", color: "var(--ink)" }}
          placeholder="اكتب رسالتك بهدوء.. ستصل مباشرة إلى لوحة تحكم صاحب المنصة."
        />
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          {body.length} / 3000 حرف — اكتب سطرين على الأقل أو 50 حرفًا ليثمر حوارك نفعًا
        </p>
      </div>

      {state === "error" && (
        <p className="mt-3 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "#FEF2F2", color: "#991B1B" }}>
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-6 w-full rounded-2xl px-6 py-3.5 text-sm font-bold transition-all hover:shadow-lift disabled:opacity-60"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {state === "sending" ? "جارٍ الإرسال.." : "إرسال الرسالة إلى الإدارة"}
      </button>
    </form>
  );
}
