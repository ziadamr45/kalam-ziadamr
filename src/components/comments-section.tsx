"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { analyzeComment } from "@/lib/moderation";
import { getVisitorFingerprint } from "@/lib/fingerprint";
import { formatArabicDate } from "@/lib/utils";

type PublicComment = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
};

const REPORT_REASONS = ["إساءة أو لغة غير لائقة", "إعلان أو سبام", "مخالفة القيم", "سبب آخر"];

export function CommentsSection({
  articleId,
  articleSlug,
  initialComments,
  isLoggedIn,
}: {
  articleId: string;
  articleSlug?: string;
  initialComments: PublicComment[];
  isLoggedIn: boolean;
}) {
  const { data: session } = useSession();
  const [comments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "blocked" | "sending" | "sent" | "error">("idle");
  const [blockReason, setBlockReason] = useState<string>("");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportSent, setReportSent] = useState<string | null>(null);

  const loggedIn = isLoggedIn && Boolean(session?.user);

  /* الفلترة اللحظية قبل الإرسال */
  const onContentChange = (value: string) => {
    setContent(value);
    setStatus("idle");
    if (value.trim().length >= 3) {
      const verdict = analyzeComment(value);
      if (verdict.status === "REJECT") {
        setStatus("blocked");
        setBlockReason(verdict.reasons[0] ?? "التعليق يخالف أدب الحوار");
        return;
      }
    }
    setBlockReason("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "blocked" || !content.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, content: content.trim(), fp: getVisitorFingerprint() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus("error");
        return;
      }
      if (!res.ok) {
        setBlockReason(data?.error ?? "تعذر إرسال التعليق");
        setStatus("blocked");
        return;
      }
      setStatus("sent");
      setContent("");
    } catch {
      setStatus("error");
    }
  };

  const sendReport = async (commentId: string) => {
    try {
      await fetch("/api/comments/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, reason: reportReason, fp: getVisitorFingerprint() }),
      });
      setReportSent(commentId);
      setReportFor(null);
    } catch {}
  };

  return (
    <section id="comments" className="page-chrome mt-12 border-t pt-10" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-ui mb-6 text-xl font-bold" style={{ color: "var(--ink)" }}>
        الحوار ({comments.length > 0 ? new Intl.NumberFormat("ar-EG").format(comments.length) : "لا تعليقات بعد"})
      </h2>

      {/* نموذج التعليق */}
      {loggedIn ? (
        <form
          onSubmit={submit}
          className="rounded-2xl border p-5 shadow-soft"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={3}
            maxLength={1200}
            placeholder="شارك رأيك بهدوء واحترام.. الكلام الراقي أقوى أثرًا."
            className="w-full resize-none rounded-xl border bg-transparent p-4 leading-8 outline-none transition-colors focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--ink)" }}
          />

          {status === "blocked" && (
            <p className="mt-2 text-sm font-semibold" style={{ color: "#DC2626" }}>
              {blockReason}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
              مراجعة فريق التحرير قبل الظهور — للحفاظ على رقيّ الحوار
            </span>
            <button
              type="submit"
              disabled={status === "sending" || status === "blocked" || !content.trim()}
              className="rounded-full px-5 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {status === "sending" ? "جارٍ الإرسال.." : "أرسل"}
            </button>
          </div>

          {status === "sent" && (
            <p className="mt-3 text-sm font-semibold" style={{ color: "var(--accent-strong)" }}>
              تعليقك وصل وسيظهر بعد مراجعة فريق التحرير. شكرًا لكلامك المؤدَّب.
            </p>
          )}
        </form>
      ) : (
        <div
          className="mb-8 flex flex-col items-center justify-between gap-4 rounded-2xl border p-5 sm:flex-row"
          style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          <p className="font-body leading-8" style={{ color: "var(--ink-muted)" }}>
            سجّل الدخول بحساب Google للمشاركة في الحوار — للحفاظ على مساحة نقية بلا مزعجين.
          </p>
          <Link
            href={`/login?callback=${encodeURIComponent(`/article/${articleSlug ?? ""}`)}`}
            className="flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105"
            style={{ background: "var(--surface)", color: "var(--ink)", borderColor: "var(--border)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
            دخول بحساب Google
          </Link>
        </div>
      )}

      {/* قائمة التعليقات */}
      <ul className="space-y-4">
        {comments.map((c) => (
          <li
            key={c.id}
            className="rounded-2xl border p-5 shadow-soft"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  {c.authorName.charAt(0)}
                </span>
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                    {c.authorName}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                    {formatArabicDate(c.createdAt)}
                  </p>
                </div>
              </div>

              {reportSent === c.id ? (
                <span className="text-xs" style={{ color: "var(--accent-strong)" }}>
                  تم استلام الإبلاغ، شكرًا لك
                </span>
              ) : (
                <button
                  onClick={() => setReportFor(reportFor === c.id ? null : c.id)}
                  className="rounded-full p-2 text-xs transition-colors hover:bg-[var(--accent-soft)]"
                  style={{ color: "var(--ink-muted)" }}
                  title="إبلاغ عن التعليق"
                  aria-label="إبلاغ عن التعليق"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></svg>
                </button>
              )}
            </div>

            <p className="font-body leading-9" style={{ color: "var(--ink)" }}>
              {c.content}
            </p>

            {reportFor === c.id && (
              <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                  سبب الإبلاغ:
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReportReason(r)}
                      className="rounded-full border px-3 py-1.5 text-xs transition-all"
                      style={
                        reportReason === r
                          ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                          : { color: "var(--ink-muted)", borderColor: "var(--border)" }
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => sendReport(c.id)}
                  className="rounded-full px-4 py-2 text-xs font-bold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  إرسال الإبلاغ
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
