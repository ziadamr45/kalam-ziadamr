"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getVisitorFingerprint } from "@/lib/fingerprint";
import { easternDigits } from "@/lib/utils";
import { requestAuth, onAuthIntent } from "@/components/auth-gate";

/**
 * أزرار الإعجاب/عدم الإعجاب — تحديث تفاؤلي فوري بلا إعادة تحميل،
 * تصويت واحد لكل زائر، إلغاء التصويت بالنقر على نفس الزر.
 * الصفحة ISR ثابتة — لذا يجلب المكوّن تصويت الزائر الحالي بنفسه عبر
 * GET /api/interactions فور التركيب بدل اعتماد بيانات الخادم الثابتة.
 */
export function InteractionSlot({
  articleId,
  initialLikes,
  initialDislikes,
}: {
  articleId: string;
  initialLikes: number;
  initialDislikes: number;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { status } = useSession();
  const authed = status === "authenticated";

  /* جلب تصويت الزائر الحالي من الخادم — الصفحة نفسها مخزّنة ثابتًا (ISR) */
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ articleId, fp: getVisitorFingerprint() });
    fetch(`/api/interactions?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { likes?: number; dislikes?: number; myVote?: number | null } | null) => {
        if (cancelled || !data) return;
        if (typeof data.likes === "number") setLikes(data.likes);
        if (typeof data.dislikes === "number") setDislikes(data.dislikes);
        setMyVote(data.myVote ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  const vote = useCallback(
    async (value: 1 | -1) => {
      if (busy) return;

      /* بوابة المصادقة: التصويت للأعضاء المسجلين — نافذة دخول ذكية تحتفظ بالنية */
      if (!authed) {
        requestAuth({ kind: "vote-article", payload: { value } });
        return;
      }
      setBusy(true);

      /* تحديث تفاؤلي فوري */
      const prev = { likes, dislikes, myVote };
      let nextLikes = likes;
      let nextDislikes = dislikes;
      let nextVote: number | null = value;

      if (myVote === value) {
        nextVote = null;
        if (value === 1) nextLikes -= 1;
        else nextDislikes -= 1;
      } else {
        if (myVote === 1) nextLikes -= 1;
        if (myVote === -1) nextDislikes -= 1;
        if (value === 1) nextLikes += 1;
        else nextDislikes += 1;
      }

      setLikes(nextLikes);
      setDislikes(nextDislikes);
      setMyVote(nextVote);

      try {
        const res = await fetch("/api/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId, value, fp: getVisitorFingerprint() }),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { likes: number; dislikes: number; myVote: number | null };
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setMyVote(data.myVote);
      } catch {
        /* تراجع عن التفاؤل عند الفشل */
        setLikes(prev.likes);
        setDislikes(prev.dislikes);
        setMyVote(prev.myVote);
      } finally {
        setBusy(false);
      }
    },
    [articleId, busy, dislikes, likes, myVote, authed],
  );

  /* تنفيذ النية المحفوظة — عاد المستخدم من تسجيل الدخول ليصوّت تلقائيًا */
  const voteRef = useRef(vote);
  useEffect(() => {
    voteRef.current = vote;
  });
  useEffect(
    () =>
      onAuthIntent((intent) => {
        if (intent.kind === "vote-article") {
          const v = intent.payload?.value === -1 ? -1 : 1;
          void voteRef.current(v);
        }
      }),
    [],
  );

  return (
    <div className="flex w-full items-center justify-center gap-3 sm:w-auto">
      <button
        onClick={() => vote(1)}
        disabled={busy}
        aria-pressed={myVote === 1}
        className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-300 ease-fluid hover:-translate-y-0.5 disabled:opacity-50 sm:flex-none"
        style={
          myVote === 1
            ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
            : { borderColor: "var(--border)", color: "var(--ink)" }
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={myVote === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
        أعجبني
        <span className="text-xs opacity-80">{easternDigits(likes)}</span>
      </button>

      <button
        onClick={() => vote(-1)}
        disabled={busy}
        aria-pressed={myVote === -1}
        className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-300 ease-fluid hover:translate-y-0.5 disabled:opacity-50 sm:flex-none"
        style={
          myVote === -1
            ? { background: "var(--ink-muted)", borderColor: "var(--ink-muted)", color: "#fff" }
            : { borderColor: "var(--border)", color: "var(--ink-muted)" }
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={myVote === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}>
          <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
        لم يعجبني
        <span className="text-xs opacity-80">{easternDigits(dislikes)}</span>
      </button>
    </div>
  );
}
