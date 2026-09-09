"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { analyzeComment } from "@/lib/moderation";
import { getVisitorFingerprint } from "@/lib/fingerprint";
import { formatArabicDate } from "@/lib/utils";
import { RankBadge } from "@/components/rank-badge";

type PublicComment = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorImage: string | null;
  authorRank: string | null;
  isInspiring: boolean;
  /* منظومة التوثيق السيادي — شارة الحسابات المميزة */
  authorVerified?: boolean;
  authorBadgeTitle?: string | null;
  authorBadgeColor?: string | null;
  /* إطار التعليق الفخم — لون شارة الكاتب عند امتلاكه الصلاحية */
  authorAccent?: string | null;
  /* تثبيت ذاتي من كاتبه */
  selfPinned?: boolean;
  likes: number;
  dislikes: number;
};

/** ختم التوثيق الرسمي — يظهر بجانب أسماء الحسابات الموثقة في كل النقاشات */
function VerifiedSeal({ color, title }: { color: string; title: string }) {
  return (
    <span title={`${title} — حساب موثّق رسميًا`} aria-label={`حساب موثق: ${title}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill={color} aria-hidden className="shrink-0">
        <path d="M12 1.5l2.5 2.1 3.2-.4 1.2 3 3 1.2-.4 3.2L23.5 12l-2 2.4.4 3.2-3 1.2-1.2 3-3.2-.4L12 23.5l-2.5-2.1-3.2.4-1.2-3-3-1.2.4-3.2L.5 12l2-2.4-.4-3.2 3-1.2 1.2-3 3.2.4L12 1.5z" />
        <path d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff" />
      </svg>
    </span>
  );
}

const REPORT_REASONS = ["إساءة أو لغة غير لائقة", "إعلان أو سبام", "مخالفة القيم", "سبب آخر"];
const CUSTOM_REASON = "سبب آخر";

export function CommentsSection({
  articleId,
  articleSlug,
  initialComments,
  isLoggedIn,
}: {
  articleId: string;
  articleSlug?: string;
  initialComments: PublicComment[];
  /* الصفحة ISR ثابتة — الحالة الفعلية للجلسة تُقرأ من useSession أدناه؛
     الخاصية متروكة اختيارية للتوافق وتعمل كمفتاح قسر عند تمرير false */
  isLoggedIn?: boolean;
}) {
  const { data: session } = useSession();
  const [comments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "blocked" | "sending" | "sent" | "error">("idle");
  const [blockReason, setBlockReason] = useState<string>("");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [reportSent, setReportSent] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [impactNote, setImpactNote] = useState<string>("");
  /* فخ الروبوتات — حقل مخفي عن البشر تمامًا، البوتات الملئة لكل الحقول ستملؤه */
  const [honey, setHoney] = useState("");

  /* التصويت — أصواتي تُجلب من الخادم بعد الرسم الأولي (الصفحة ISR ثابتة) */
  const [myVotes, setMyVotes] = useState<Record<string, "LIKE" | "DISLIKE">>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, { likes: number; dislikes: number }>>(
    () => Object.fromEntries(initialComments.map((c) => [c.id, { likes: c.likes, dislikes: c.dislikes }])),
  );
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voteNotice, setVoteNotice] = useState<string | null>(null);

  const loggedIn = (isLoggedIn ?? true) && Boolean(session?.user);
  const myId = session?.user?.id ?? null;

  /* صلاحيات المشاهد — التثبيت الذاتي يُقرأ من الخادم بعد الجلسة (لا ثقة بالعميل) */
  const [canSelfPin, setCanSelfPin] = useState(false);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!loggedIn) {
      setCanSelfPin(false);
      return;
    }
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCanSelfPin(Boolean(d?.canSelfPin)))
      .catch(() => {});
  }, [loggedIn]);

  /* التثبيت الذاتي — يُنفذ في الخادم بعد فحص الصلاحية مرة أخرى */
  const togglePin = async (commentId: string, pin: boolean) => {
    setPinBusy(commentId);
    try {
      const res = await fetch(`/api/comments/${commentId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        /* إعادة تحميل خفيفة للصفحة تعكس الترتيب الجديد من الخادم */
        window.location.reload();
      }
    } finally {
      setPinBusy(null);
    }
  };

  /* أصواتي على تعليقات هذا المقال */
  useEffect(() => {
    if (!loggedIn) {
      setMyVotes({});
      return;
    }
    fetch(`/api/comments/votes?articleId=${encodeURIComponent(articleId)}`)
      .then((r) => r.json())
      .then((d) => setMyVotes(d?.myVotes ?? {}))
      .catch(() => {});
  }, [articleId, loggedIn]);

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
        body: JSON.stringify({ articleId, content: content.trim(), fp: getVisitorFingerprint(), honey }),
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
      if (data?.impact?.awarded) {
        setImpactNote(`+${data.impact.points} رصيد أثر — ${data.impact.rankUp ? `وترقيت إلى «${data.impact.rank}»` : `رصيدك الآن ${data.impact.impactScore}`}`);
      }
    } catch {
      setStatus("error");
    }
  };

  const sendReport = async (commentId: string) => {
    setReportError(null);
    /* «سبب آخر» إلزامي الوصف — نفحص قبل الإرسال */
    if (reportReason === CUSTOM_REASON && customReason.trim().length < 5) {
      setReportError("صف المخالفة بدقة في الحقل المخصص — الوصف إلزامي.");
      return;
    }
    try {
      const res = await fetch("/api/comments/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          reason: reportReason,
          details: reportReason === CUSTOM_REASON ? customReason.trim() : undefined,
          fp: getVisitorFingerprint(),
          honey,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReportError(data?.error ?? "تعذر إرسال الإبلاغ — جرّب مرة أخرى.");
        return;
      }
      setReportSent(commentId);
      setReportFor(null);
      setCustomReason("");
    } catch {
      setReportError("تعذر إرسال الإبلاغ — تحقق من اتصالك.");
    }
  };

  /* التصويت على تعليق — الزائر يُستقبَل بردّ هادئ يوجهه للبوابة */
  const vote = async (commentId: string, value: "LIKE" | "DISLIKE") => {
    if (!loggedIn) {
      setVoteNotice("سجّل الدخول أولًا لتفعيل التفاعل — الإعجاب وعدم الإعجاب للقارئين المسجلين فقط.");
      window.setTimeout(() => setVoteNotice(null), 6000);
      return;
    }
    setVoteBusy(commentId);
    const prev = { myVotes, voteCounts };
    try {
      const res = await fetch(`/api/comments/${commentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setVoteNotice("سجّل الدخول أولًا لتفعيل التفاعل.");
        window.setTimeout(() => setVoteNotice(null), 6000);
        return;
      }
      if (!res.ok) {
        setVoteNotice(data?.error ?? "تعذر التصويت — جرّب مرة أخرى.");
        window.setTimeout(() => setVoteNotice(null), 6000);
        return;
      }
      /* التحديث المتفائل المؤكد من رد الخادم */
      setMyVotes((prevVotes) => {
        const next = { ...prevVotes };
        if (data.myVote) next[commentId] = data.myVote;
        else delete next[commentId];
        return next;
      });
      setVoteCounts((prevCounts) => ({
        ...prevCounts,
        [commentId]: { likes: data.likes ?? 0, dislikes: data.dislikes ?? 0 },
      }));
    } catch {
      setVoteNotice("تعذر التصويت — تحقق من اتصالك.");
      window.setTimeout(() => setVoteNotice(null), 6000);
      void prev; // استعادة غير ضرورية — الخادم هو المرجع دائمًا
    } finally {
      setVoteBusy(null);
    }
  };

  return (
    <section id="comments" className="page-chrome no-print mt-12 border-t pt-10" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-ui mb-6 text-xl font-bold" style={{ color: "var(--ink)" }}>
        الحوار ({comments.length > 0 ? new Intl.NumberFormat("ar-EG").format(comments.length) : "لا تعليقات بعد"})
      </h2>

      {/* التنبيه الهادئ للزائر عند محاولة التفاعل */}
      {voteNotice && (
        <div
          className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--ink)" }}
          role="status"
        >
          <span className="leading-7">{voteNotice}</span>
          <Link
            href={`/auth/login?callback=${encodeURIComponent(`/article/${articleSlug ?? ""}#comments`)}`}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-bold shadow-soft transition-all hover:scale-105"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            تسجيل الدخول باستخدام Google
          </Link>
        </div>
      )}

      {/* نموذج التعليق */}
      {loggedIn ? (
        <form
          onSubmit={submit}
          className="rounded-2xl border p-5 shadow-soft"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {/* فخ السبام — خارج الشاشة بكل المقاييس: لا يراه الإنسان ولا يلمسه */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className="pointer-events-none absolute h-0 w-0 -translate-x-[9999px] opacity-0"
          />
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
              {impactNote && (
                <span className="mt-1 block text-xs" style={{ color: "var(--ink-muted)" }}>
                  ✦ {impactNote}
                </span>
              )}
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
            href={`/auth/login?callback=${encodeURIComponent(`/article/${articleSlug ?? ""}#comments`)}`}
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
        {comments.map((c) => {
          const mine = Boolean(myId && c.authorId && c.authorId === myId);
          const counts = voteCounts[c.id] ?? { likes: c.likes, dislikes: c.dislikes };
          const myVote = myVotes[c.id] ?? null;
          return (
            <li
              key={c.id}
              className="rounded-2xl border p-5 shadow-soft transition-colors"
              style={
                c.authorAccent
                  ? /* إطار التعليق الفخم — بلون شارة الكاتب الموثق */
                    { background: "var(--surface)", borderColor: c.authorAccent, borderWidth: 2 }
                  : mine
                    ? /* تعليقك أنت — خلفية كهرمانية هادئة وإطار مميز */
                      { background: "#FFFBEB", borderColor: "#FCD34D" }
                    : c.isInspiring
                      ? { background: "var(--accent-soft)", borderColor: "var(--accent)" }
                      : { background: "var(--surface)", borderColor: "var(--border)" }
              }
            >
              {c.selfPinned && (
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold" style={{ color: c.authorAccent ?? "var(--accent-strong)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M16 3l5 5-1.4 1.4-1-1-4.2 4.2.6 4.6-1.4 1.4-3.5-3.5L6 19.4 4.6 18l4.3-4.1-3.5-3.5L6.8 9l4.6.6L15.6 5.4l-1-1L16 3z" />
                  </svg>
                  مثبَّت من كاتبه — صلاحية الحسابات المميزة
                </p>
              )}
              {c.isInspiring && (
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--accent-strong)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
                  </svg>
                  تعليق فكري ملهم — مثبَّت أعلى الحوار بتمييز التحرير
                </p>
              )}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {c.authorImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.authorImage}
                      alt={c.authorName}
                      width={36}
                      height={36}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 rounded-full border-2 object-cover"
                      style={{ borderColor: "var(--accent-soft)" }}
                    />
                  ) : (
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full font-bold"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                    >
                      {c.authorName.charAt(0)}
                    </span>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                        {c.authorName}
                      </p>
                      {/* ختم التوثيق الرسمي + مسمى الشارة — بلون تصنيف الحساب */}
                      {c.authorVerified && (
                        <VerifiedSeal color={c.authorBadgeColor || "#2563EB"} title={c.authorBadgeTitle || "حساب موثّق"} />
                      )}
                      {c.authorVerified && c.authorBadgeTitle && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: `${c.authorBadgeColor || "#2563EB"}1f`,
                            color: c.authorBadgeColor || "#2563EB",
                          }}
                        >
                          {c.authorBadgeTitle}
                        </span>
                      )}
                      {/* شارة «أنت» — بجانب اسمك واضحة بلون كهرماني مميز */}
                      {mine && (
                        <span className="text-amber-500 font-medium text-xs">(أنت)</span>
                      )}
                      {c.authorRank && c.authorRank !== "قارئ متأمل" && <RankBadge rank={c.authorRank} />}
                    </div>
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
                    onClick={() => {
                      setReportFor(reportFor === c.id ? null : c.id);
                      setReportError(null);
                    }}
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

              {/* شريط التفاعل — إعجاب/عدم إعجاب بعدادات وألوان تعكس اختيارك */}
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  onClick={() => vote(c.id, "LIKE")}
                  disabled={voteBusy === c.id}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                  style={
                    myVote === "LIKE"
                      ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                      : { background: "transparent", color: "var(--ink-muted)", borderColor: "var(--border)" }
                  }
                  title="إعجاب"
                  aria-label="أبدى إعجابي بهذا التعليق"
                  aria-pressed={myVote === "LIKE"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={myVote === "LIKE" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  <span>{counts.likes > 0 ? new Intl.NumberFormat("ar-EG").format(counts.likes) : "إعجاب"}</span>
                </button>
                <button
                  onClick={() => vote(c.id, "DISLIKE")}
                  disabled={voteBusy === c.id}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                  style={
                    myVote === "DISLIKE"
                      ? { background: "#DC2626", color: "#fff", borderColor: "#DC2626" }
                      : { background: "transparent", color: "var(--ink-muted)", borderColor: "var(--border)" }
                  }
                  title="عدم إعجاب"
                  aria-label="أبدى عدم إعجابي بهذا التعليق"
                  aria-pressed={myVote === "DISLIKE"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={myVote === "DISLIKE" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  <span>{counts.dislikes > 0 ? new Intl.NumberFormat("ar-EG").format(counts.dislikes) : "لم يعجبني"}</span>
                </button>
                {/* التثبيت الذاتي — زر يظهر على تعليقك فقط عند امتلاكك الصلاحية */}
                {mine && canSelfPin && (
                  <button
                    onClick={() => togglePin(c.id, !c.selfPinned)}
                    disabled={pinBusy === c.id}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                    style={
                      c.selfPinned
                        ? { background: c.authorAccent ?? "var(--accent)", color: "#fff", borderColor: c.authorAccent ?? "var(--accent)" }
                        : { background: "transparent", color: "var(--ink-muted)", borderColor: "var(--border)" }
                    }
                    title={c.selfPinned ? "فك التثبيت" : "ثبّت تعليقك أعلى النقاش"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3l5 5-1.4 1.4-1-1-4.2 4.2.6 4.6-1.4 1.4-3.5-3.5L6 19.4 4.6 18l4.3-4.1-3.5-3.5L6.8 9l4.6.6L15.6 5.4l-1-1L16 3z" /></svg>
                    {c.selfPinned ? "مثبَّت" : "تثبيت"}
                  </button>
                )}
              </div>

              {reportFor === c.id && (
                <div className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <p className="mb-2 text-xs font-bold" style={{ color: "var(--ink)" }}>
                    سبب الإبلاغ:
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          setReportReason(r);
                          setReportError(null);
                        }}
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
                  {/* «سبب آخر» — حقل نصي إلزامي يظهر تلقائيًا */}
                  {reportReason === CUSTOM_REASON && (
                    <textarea
                      value={customReason}
                      onChange={(e) => {
                        setCustomReason(e.target.value);
                        setReportError(null);
                      }}
                      rows={2}
                      maxLength={500}
                      placeholder="صف المخالفة بدقة.."
                      className="textarea-bordered mt-2 w-full resize-none rounded-xl border bg-transparent p-3 text-sm leading-7 outline-none transition-colors focus:border-[var(--accent)]"
                      style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                    />
                  )}
                  {reportError && (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "#DC2626" }}>
                      {reportError}
                    </p>
                  )}
                  {/* فخ ثانٍ لنموذج الإبلاغ — نفس المبدأ خارج الشاشة */}
                  <input
                    type="text"
                    name="website2"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={honey}
                    onChange={(e) => setHoney(e.target.value)}
                    className="pointer-events-none absolute h-0 w-0 -translate-x-[9999px] opacity-0"
                  />
                  <button
                    onClick={() => sendReport(c.id)}
                    className="mt-2 rounded-full px-4 py-2 text-xs font-bold"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    إرسال الإبلاغ
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
