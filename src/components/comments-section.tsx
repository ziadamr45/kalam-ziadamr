"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { analyzeComment } from "@/lib/moderation";
import { getVisitorFingerprint } from "@/lib/fingerprint";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";
import { formatArabicDate } from "@/lib/utils";
import { RankBadge } from "@/components/rank-badge";
import { FramedAvatar } from "@/components/avatar-frame";
import { SOCIAL_LINK_LABELS, type VerifiedSocialLinks } from "@/lib/verification-meta";

type PublicComment = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorImage: string | null;
  authorFrame?: string | null;
  authorRank: string | null;
  isInspiring: boolean;
  authorVerified?: boolean;
  authorSealColor?: string | null;
  authorSealLabel?: string | null;
  authorIsVip?: boolean;
  authorBadgeTitle?: string | null;
  authorBadgeColor?: string | null;
  authorAccent?: string | null;
  authorCard?: { extendedBio: string | null; links: VerifiedSocialLinks } | null;
  selfPinned?: boolean;
  likes: number;
  dislikes: number;
};

function MiniSpinner({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="animate-spin motion-reduce:animate-none shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

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

const CARD_LINK_ORDER = [
  "website",
  "facebook",
  "instagram",
  "telegram",
  "whatsapp",
  "youtube",
  "tiktok",
  "x",
  "linkedin",
] as const;

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
  isLoggedIn?: boolean;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState(initialComments);
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "blocked" | "sending" | "sent" | "error">("idle");
  const [blockReason, setBlockReason] = useState<string>("");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [reportBusy, setReportBusy] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [impactNote, setImpactNote] = useState<string>("");
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState<string | null>(null);
  const [honey, setHoney] = useState("");

  const [myVotes, setMyVotes] = useState<Record<string, "LIKE" | "DISLIKE">>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, { likes: number; dislikes: number }>>(
    () => Object.fromEntries(initialComments.map((c) => [c.id, { likes: c.likes, dislikes: c.dislikes }])),
  );
  const voteSeqRef = useRef<Record<string, number>>({});
  const [voteNotice, setVoteNotice] = useState<string | null>(null);

  const loggedIn = (isLoggedIn ?? true) && Boolean(session?.user);
  const myId = session?.user?.id ?? null;

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

  const togglePin = async (commentId: string, pin: boolean) => {
    if (pinBusy) return;
    setPinBusy(commentId);
    const prevComments = comments;
    const nextComments = comments
      .map((c) => {
        if (c.id === commentId) return { ...c, selfPinned: pin };
        if (pin && myId && c.authorId === myId && c.selfPinned) return { ...c, selfPinned: false };
        return c;
      })
      .sort(
        (a, b) =>
          Number(Boolean(b.isInspiring)) - Number(Boolean(a.isInspiring)) ||
          Number(Boolean(b.selfPinned)) - Number(Boolean(a.selfPinned)) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    setComments(nextComments);
    try {
      const res = await fetch(`/api/comments/${commentId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setComments(prevComments);
        setVoteNotice(data?.error ?? "تعذر تحديث التثبيت — جرّب مرة أخرى.");
        window.setTimeout(() => setVoteNotice(null), 5000);
      }
    } catch {
      setComments(prevComments);
      setVoteNotice("تعذر تحديث التثبيت — تحقق من اتصالك.");
      window.setTimeout(() => setVoteNotice(null), 5000);
    } finally {
      setPinBusy(null);
    }
  };

  const deleteOwnComment = async (commentId: string) => {
    if (deleteBusy) return;
    setDeleteBusy(commentId);
    try {
      const res = await fetch(`/api/comments?id=${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVoteNotice(data?.error ?? "تعذر حذف التعليق — جرّب مرة أخرى.");
        window.setTimeout(() => setVoteNotice(null), 5000);
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setDeleteConfirm(null);
    } catch {
      setVoteNotice("تعذر حذف التعليق — تحقق من اتصالك.");
      window.setTimeout(() => setVoteNotice(null), 5000);
    } finally {
      setDeleteBusy(null);
    }
  };

  const saveEditComment = async (commentId: string) => {
    if (editBusy || !editContent.trim()) return;
    const verdict = analyzeComment(editContent);
    if (verdict.status === "REJECT") {
      setEditError(verdict.reasons[0] ?? "التعليق يخالف أدب الحوار");
      return;
    }
    setEditBusy(commentId);
    setEditError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: commentId, content: editContent.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data?.error ?? "تعذر حفظ التعديل — جرّب مرة أخرى.");
        return;
      }
      if (data?.comment?.status === "PENDING") {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setVoteNotice("تم حفظ تعديلك وسيمرّ على المراجعة قبل الظهور مجددًا.");
        window.setTimeout(() => setVoteNotice(null), 5000);
      } else {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, content: editContent.trim() } : c)),
        );
      }
      setEditId(null);
      setEditContent("");
    } catch {
      setEditError("تعذر حفظ التعديل — تحقق من اتصالك.");
    } finally {
      setEditBusy(null);
    }
  };

  useEffect(() => {
    fetch(`/api/comments/votes?articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.myVotes) setMyVotes(d.myVotes);
        if (d?.counts && typeof d.counts === "object") {
          setVoteCounts((prev) => {
            const next = { ...prev };
            for (const [id, c] of Object.entries(d.counts as Record<string, { likes: number; dislikes: number }>)) {
              next[id] = c;
            }
            return next;
          });
        }
      })
      .catch(() => {});
  }, [articleId, loggedIn]);

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
    if (reportBusy) return;
    setReportError(null);
    if (reportReason === CUSTOM_REASON && customReason.trim().length < 5) {
      setReportError("صف المخالفة بدقة في الحقل المخصص — الوصف إلزامي.");
      return;
    }
    setReportBusy(commentId);
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
    } finally {
      setReportBusy(null);
    }
  };

  useEffect(
    () =>
      onAuthIntent((intent) => {
        if (intent.kind !== "comment") return;
        document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => {
          document.querySelector<HTMLTextAreaElement>("#comments form textarea")?.focus();
        }, 700);
      }),
    [],
  );

  const vote = async (commentId: string, value: "LIKE" | "DISLIKE") => {
    if (!loggedIn) {
      requestAuth({ kind: "vote-comment" });
      return;
    }

    const seq = (voteSeqRef.current[commentId] ?? 0) + 1;
    voteSeqRef.current[commentId] = seq;

    const prevVote = myVotes[commentId] ?? null;
    const prevCounts = voteCounts[commentId] ?? { likes: 0, dislikes: 0 };

    let nextVote: "LIKE" | "DISLIKE" | null = value;
    let nextLikes = prevCounts.likes;
    let nextDislikes = prevCounts.dislikes;
    if (prevVote === value) {
      nextVote = null;
      if (value === "LIKE") nextLikes = Math.max(0, nextLikes - 1);
      else nextDislikes = Math.max(0, nextDislikes - 1);
    } else {
      if (prevVote === "LIKE") nextLikes = Math.max(0, nextLikes - 1);
      if (prevVote === "DISLIKE") nextDislikes = Math.max(0, nextDislikes - 1);
      if (value === "LIKE") nextLikes += 1;
      else nextDislikes += 1;
    }

    setMyVotes((curr) => {
      const copy = { ...curr };
      if (nextVote) copy[commentId] = nextVote;
      else delete copy[commentId];
      return copy;
    });
    setVoteCounts((curr) => ({
      ...curr,
      [commentId]: { likes: nextLikes, dislikes: nextDislikes },
    }));

    try {
      const res = await fetch(`/api/comments/${commentId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (voteSeqRef.current[commentId] !== seq) return;
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setMyVotes((curr) => {
          const copy = { ...curr };
          if (prevVote) copy[commentId] = prevVote;
          else delete copy[commentId];
          return copy;
        });
        setVoteCounts((curr) => ({ ...curr, [commentId]: prevCounts }));
        setVoteNotice("سجّل الدخول أولًا لتفعيل التفاعل.");
        window.setTimeout(() => setVoteNotice(null), 6000);
        return;
      }
      if (!res.ok) {
        setMyVotes((curr) => {
          const copy = { ...curr };
          if (prevVote) copy[commentId] = prevVote;
          else delete copy[commentId];
          return copy;
        });
        setVoteCounts((curr) => ({ ...curr, [commentId]: prevCounts }));
        setVoteNotice(data?.error ?? "تعذر التصويت — جرّب مرة أخرى.");
        window.setTimeout(() => setVoteNotice(null), 6000);
        return;
      }
      setMyVotes((curr) => {
        const next = { ...curr };
        if (data.myVote) next[commentId] = data.myVote;
        else delete next[commentId];
        return next;
      });
      setVoteCounts((curr) => ({
        ...curr,
        [commentId]: { likes: data.likes ?? nextLikes, dislikes: data.dislikes ?? nextDislikes },
      }));
    } catch {
      if (voteSeqRef.current[commentId] !== seq) return;
      setMyVotes((curr) => {
        const copy = { ...curr };
        if (prevVote) copy[commentId] = prevVote;
        else delete copy[commentId];
        return copy;
      });
      setVoteCounts((curr) => ({ ...curr, [commentId]: prevCounts }));
      setVoteNotice("تعذر التصويت — تحقق من اتصالك.");
      window.setTimeout(() => setVoteNotice(null), 6000);
    }
  };

  return (
    <section id="comments" className="page-chrome no-print mt-12 border-t pt-10" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-ui mb-6 text-xl font-bold" style={{ color: "var(--ink)" }}>
        الحوار ({comments.length > 0 ? new Intl.NumberFormat("ar-EG").format(comments.length) : "لا تعليقات بعد"})
      </h2>

      {voteNotice && (
        <div
          className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center"
          style={{ background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--ink)" }}
          role="status"
        >
          <span className="leading-7">{voteNotice}</span>
          {!loggedIn && (
            <Link
              href={`/auth/login?callback=${encodeURIComponent(`/article/${articleSlug ?? ""}#comments`)}`}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-bold shadow-soft transition-all hover:scale-105"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              تسجيل الدخول باستخدام Google
            </Link>
          )}
        </div>
      )}

      {loggedIn ? (
        <form
          onSubmit={submit}
          className="mb-6 rounded-2xl border p-5 shadow-soft"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honey}
            onChange={(e) => setHoney(e.target.value)}
            className="pointer-events-none absolute h-0 w-0 translate-x-[-9999px] opacity-0"
          />
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={3}
            maxLength={1200}
            placeholder="شارك رأيك بهدوء واحترام.. الكلام الراقي أقوى أثرًا."
            className="w-full resize-none rounded-xl border bg-transparent p-4 leading-8 outline-hidden transition-colors focus:border-(--accent)"
            style={{ borderColor: "var(--border)", color: "var(--ink)" }}
          />

          {status === "blocked" && (
            <p className="mt-2 text-sm font-semibold" style={{ color: "#DC2626" }}>
              {blockReason}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              <span>مراجعة فريق التحرير قبل الظهور — للحفاظ على رقيّ الحوار</span>
              <span className="tabular-nums opacity-80">
                {new Intl.NumberFormat("ar-EG").format(content.length)} / ١٬٢٠٠
              </span>
            </div>
            <button
              type="submit"
              disabled={status === "sending" || status === "blocked" || !content.trim()}
              className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {status === "sending" && <MiniSpinner size={14} />}
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
          className="mb-6 flex flex-col items-center justify-between gap-4 rounded-2xl border p-5 sm:flex-row"
          style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          <p className="font-body leading-8" style={{ color: "var(--ink-muted)" }}>
            سجّل الدخول بحساب Google للمشاركة في الحوار — للحفاظ على مساحة نقية بلا مزعجين.
          </p>
          <button
            type="button"
            onClick={() => requestAuth({ kind: "comment" })}
            className="flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105"
            style={{ background: "var(--surface)", color: "var(--ink)", borderColor: "var(--border)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"/></svg>
            دخول بحساب Google
          </button>
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {comments.map((c) => {
          const mine = Boolean(myId && c.authorId && c.authorId === myId);
          const counts = voteCounts[c.id] ?? { likes: c.likes, dislikes: c.dislikes };
          const myVote = myVotes[c.id] ?? null;
          const isEditing = editId === c.id;
          return (
            <li
              key={c.id}
              className="rounded-2xl border p-5 shadow-soft transition-colors"
              style={
                c.authorAccent
                  ? { background: "var(--surface)", borderColor: c.authorAccent, borderWidth: 2 }
                  : mine
                    ? {
                        background: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
                        borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
                      }
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <FramedAvatar
                    src={c.authorImage}
                    alt={c.authorName}
                    fallbackLetter={c.authorName.charAt(0)}
                    frameId={c.authorFrame}
                    size="sm"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.authorVerified && c.authorCard ? (
                        <button
                          type="button"
                          onClick={() => setCardFor(cardFor === c.id ? null : c.id)}
                          className="cursor-pointer text-sm font-bold underline decoration-dotted decoration-from-font underline-offset-4 transition-colors hover:text-(--accent-strong)"
                          style={{ color: "var(--ink)" }}
                          title="اضغط لعرض البطاقة الفكرية الموسعة"
                          aria-expanded={cardFor === c.id}
                        >
                          {c.authorName}
                        </button>
                      ) : (
                        <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                          {c.authorName}
                        </p>
                      )}
                      {c.authorVerified && (
                        <VerifiedSeal
                          color={c.authorSealColor || "#2563EB"}
                          title={c.authorSealLabel || "حساب موثّق"}
                        />
                      )}
                      {c.authorIsVip && c.authorBadgeTitle && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: `${c.authorBadgeColor || "#7C3AED"}1f`,
                            color: c.authorBadgeColor || "#7C3AED",
                          }}
                        >
                          {c.authorBadgeTitle}
                        </span>
                      )}
                      {mine && (
                        <span className="text-xs font-bold" style={{ color: "var(--accent-strong)" }}>
                          (أنت)
                        </span>
                      )}
                      {c.authorRank && c.authorRank !== "قارئ متأمل" && <RankBadge rank={c.authorRank} />}
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      {formatArabicDate(c.createdAt)}
                    </p>
                  </div>
                </div>

                {mine ? (
                  deleteConfirm === c.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        disabled={deleteBusy === c.id}
                        onClick={() => void deleteOwnComment(c.id)}
                        className="rounded-full px-2.5 py-1 font-bold text-white transition-opacity disabled:opacity-60"
                        style={{ background: "#b4443c" }}
                      >
                        {deleteBusy === c.id ? "جارٍ الحذف…" : "تأكيد الحذف"}
                      </button>
                      <button
                        type="button"
                        disabled={deleteBusy === c.id}
                        onClick={() => setDeleteConfirm(null)}
                        className="rounded-full border px-2.5 py-1 font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditId(null);
                            setEditError(null);
                          } else {
                            setEditId(c.id);
                            setEditContent(c.content);
                            setEditError(null);
                            setDeleteConfirm(null);
                          }
                        }}
                        className="rounded-full p-2 text-xs transition-colors hover:bg-(--accent-soft)"
                        style={{ color: isEditing ? "var(--accent-strong)" : "var(--ink-muted)" }}
                        title="تعديل تعليقي"
                        aria-label="تعديل تعليقي"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirm(c.id);
                          setEditId(null);
                        }}
                        className="rounded-full p-2 text-xs transition-colors hover:bg-(--accent-soft)"
                        style={{ color: "var(--ink-muted)" }}
                        title="حذف تعليقي"
                        aria-label="حذف تعليقي"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  )
                ) : reportSent === c.id ? (
                  <span className="text-xs" style={{ color: "var(--accent-strong)" }}>
                    تم استلام الإبلاغ، شكرًا لك
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setReportFor(reportFor === c.id ? null : c.id);
                      setReportError(null);
                    }}
                    className="rounded-full p-2 text-xs transition-colors hover:bg-(--accent-soft)"
                    style={{ color: "var(--ink-muted)" }}
                    title="إبلاغ عن التعليق"
                    aria-label="إبلاغ عن التعليق"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></svg>
                  </button>
                )}
              </div>

              {cardFor === c.id && c.authorCard && (
                <div
                  className="mb-3 rounded-2xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}
                >
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: c.authorSealColor || "#2563EB" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 1.5l2.5 2.1 3.2-.4 1.2 3 3 1.2-.4 3.2L23.5 12l-2 2.4.4 3.2-3 1.2-1.2 3-3.2-.4L12 23.5l-2.5-2.1-3.2.4-1.2-3-3-1.2.4-3.2L.5 12l2-2.4-.4-3.2 3-1.2 1.2-3 3.2.4L12 1.5z" />
                      <path d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff" />
                    </svg>
                    بطاقة {c.authorSealLabel || "حساب موثّق"}
                  </p>
                  {c.authorCard.extendedBio && (
                    <p className="whitespace-pre-line text-[13px] leading-7" style={{ color: "var(--ink)" }}>
                      {c.authorCard.extendedBio}
                    </p>
                  )}
                  {!c.authorCard.extendedBio && (
                    <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
                      لم يكتب صاحب هذه البطاقة نبذته الفكرية الموسعة بعد.
                    </p>
                  )}
                  {CARD_LINK_ORDER.some((k) => c.authorCard?.links?.[k]) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CARD_LINK_ORDER.map((k) => {
                        const href = c.authorCard?.links?.[k];
                        if (!href) return null;
                        return (
                          <a
                            key={k}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="rounded-full border px-3 py-1 text-[11px] font-bold transition-all hover:-translate-y-0.5"
                            style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}
                          >
                            {SOCIAL_LINK_LABELS[k]}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {isEditing ? (
                <div className="mt-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      setEditError(null);
                    }}
                    rows={3}
                    maxLength={1200}
                    className="w-full resize-none rounded-xl border bg-transparent p-3 text-sm leading-8 outline-hidden transition-colors focus:border-(--accent)"
                    style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                  />
                  {editError && (
                    <p className="mt-1.5 text-xs font-semibold" style={{ color: "#DC2626" }}>
                      {editError}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
                      {new Intl.NumberFormat("ar-EG").format(editContent.length)} / ١٬٢٠٠
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={editBusy === c.id}
                        onClick={() => {
                          setEditId(null);
                          setEditError(null);
                        }}
                        className="rounded-full border px-3.5 py-1.5 text-xs font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        disabled={editBusy === c.id || !editContent.trim()}
                        onClick={() => void saveEditComment(c.id)}
                        className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold text-white transition-opacity disabled:opacity-50"
                        style={{ background: "var(--accent)" }}
                      >
                        {editBusy === c.id && <MiniSpinner size={12} />}
                        {editBusy === c.id ? "جارٍ الحفظ…" : "حفظ التعديل"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="font-body select-text leading-9" style={{ color: "var(--ink)" }}>
                  {c.content}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => void vote(c.id, "LIKE")}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 hover:scale-105"
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
                  onClick={() => void vote(c.id, "DISLIKE")}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 hover:scale-105"
                  style={
                    myVote === "DISLIKE"
                      ? { background: "var(--bg-soft)", color: "var(--ink)", borderColor: "var(--ink-muted)" }
                      : { background: "transparent", color: "var(--ink-muted)", borderColor: "var(--border)" }
                  }
                  title="عدم إعجاب"
                  aria-label="أبدى عدم إعجابي بهذا التعليق"
                  aria-pressed={myVote === "DISLIKE"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={myVote === "DISLIKE" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                  <span>{counts.dislikes > 0 ? new Intl.NumberFormat("ar-EG").format(counts.dislikes) : "لم يعجبني"}</span>
                </button>
                {mine && canSelfPin && (
                  <button
                    onClick={() => togglePin(c.id, !c.selfPinned)}
                    disabled={pinBusy === c.id}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 disabled:opacity-75"
                    style={
                      c.selfPinned
                        ? { background: c.authorAccent ?? "var(--accent)", color: "#fff", borderColor: c.authorAccent ?? "var(--accent)" }
                        : { background: "transparent", color: "var(--ink-muted)", borderColor: "var(--border)" }
                    }
                    title={c.selfPinned ? "فك التثبيت" : "ثبّت تعليقك أعلى النقاش"}
                  >
                    {pinBusy === c.id ? (
                      <>
                        <MiniSpinner size={13} />
                        <span>{c.selfPinned ? "جارٍ الفك…" : "جارٍ التثبيت…"}</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3l5 5-1.4 1.4-1-1-4.2 4.2.6 4.6-1.4 1.4-3.5-3.5L6 19.4 4.6 18l4.3-4.1-3.5-3.5L6.8 9l4.6.6L15.6 5.4l-1-1L16 3z" /></svg>
                        <span>{c.selfPinned ? "مثبَّت" : "تثبيت"}</span>
                      </>
                    )}
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
                        disabled={reportBusy === c.id}
                        onClick={() => {
                          setReportReason(r);
                          setReportError(null);
                        }}
                        className="rounded-full border px-3 py-1.5 text-xs transition-all disabled:opacity-60"
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
                      className="textarea-bordered mt-2 w-full resize-none rounded-xl border bg-transparent p-3 text-sm leading-7 outline-hidden transition-colors focus:border-(--accent)"
                      style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                    />
                  )}
                  {reportError && (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "#DC2626" }}>
                      {reportError}
                    </p>
                  )}
                  <input
                    type="text"
                    name="website2"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={honey}
                    onChange={(e) => setHoney(e.target.value)}
                    className="pointer-events-none absolute h-0 w-0 translate-x-[-9999px] opacity-0"
                  />
                  <button
                    onClick={() => sendReport(c.id)}
                    disabled={reportBusy === c.id}
                    className="mt-2 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-75"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {reportBusy === c.id && <MiniSpinner size={12} />}
                    {reportBusy === c.id ? "جارٍ الإرسال…" : "إرسال الإبلاغ"}
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
