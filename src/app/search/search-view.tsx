"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * صفحة البحث الفكري — وجهة مستقلة لاختصار PWA «البحث الفكري»:
 * نفس محرك البحث اللحظي (/api/search) ونفس اللغة البصرية للـ Palette
 * لكن بصفحة كاملة تصلح للفتح المباشر من الشاشة الرئيسية.
 */

type Hit = {
  slug: string;
  title: string;
  summary: string;
  section: string | null;
  sectionColor: string | null;
  readingTimeSec: number;
  views: number;
  snippet: string | null;
};

/** يلفّ كل ظهور لكلمات البحث داخل النص بوسم تمييز ذهبي */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text) return null;
  const clean = terms.filter((t) => t.length >= 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (clean.length === 0) return <>{text}</>;
  try {
    const parts = text.split(new RegExp(`(${clean.join("|")})`, "gi"));
    return (
      <>
        {parts.map((p, i) =>
          clean.some((c) => new RegExp(`^${c}$`, "i").test(p)) ? (
            <mark key={i} className="rounded px-0.5" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
              {p}
            </mark>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

function fmtTime(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 1 ? `${m} دقائق قراءة` : "قراءة سريعة";
}

export default function SearchView() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* تركيز فوري على الحقل عند الوصول */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* بحث لحظي مراجَل — نفس إيقاع الـ Palette */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((d) => setHits((d?.hits ?? []) as Hit[]))
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const terms = q.trim().split(/\s+/);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      {/* ترويسة الصفحة */}
      <div className="pt-10 text-center">
        <h1 className="font-ui text-3xl font-bold" style={{ color: "var(--ink)" }}>
          البحث الفكري
        </h1>
        <p className="font-body mt-2 text-base leading-8" style={{ color: "var(--ink-muted)" }}>
          ابحث في العناوين والمتن والأفكار.. في كل مقالات المنصة
        </p>
      </div>

      {/* حقل الإدخال */}
      <div
        className="mt-8 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-sm"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اكتب ما تبحث عنه.."
          className="min-w-0 flex-1 bg-transparent text-lg outline-none"
          style={{ color: "var(--ink)" }}
          autoComplete="off"
          enterKeyHint="search"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="مسح البحث"
            className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* النتائج */}
      <div className="mt-6">
        {q.trim().length < 2 ? (
          <p className="pt-10 text-center text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
            اكتب حرفين على الأقل ليبدأ البحث..
          </p>
        ) : busy && hits.length === 0 ? (
          <p className="pt-10 animate-pulse text-center text-sm" style={{ color: "var(--ink-muted)" }}>
            جارٍ البحث..
          </p>
        ) : hits.length === 0 ? (
          <div className="pt-10 text-center">
            <p className="font-body text-lg leading-9" style={{ color: "var(--ink-muted)" }}>
              لا نتائج مطابقة — جرّب كلمات أخرى.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {hits.map((h) => (
              <li key={h.slug}>
                <button
                  onClick={() => router.push(`/article/${h.slug}`)}
                  className="block w-full rounded-2xl border p-5 text-right transition-all hover:shadow-lift"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {h.section && (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ background: "var(--accent-soft)", color: h.sectionColor ?? "var(--accent-strong)" }}
                      >
                        {h.section}
                      </span>
                    )}
                    <span className="text-base font-bold leading-7" style={{ color: "var(--ink)" }}>
                      <Highlight text={h.title} terms={terms} />
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
                    <Highlight text={h.snippet ?? h.summary} terms={terms} />
                  </p>
                  <span className="font-ui mt-2 block text-[11px]" style={{ color: "var(--ink-muted)" }}>
                    {fmtTime(h.readingTimeSec)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
