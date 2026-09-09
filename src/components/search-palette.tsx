"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * محرك البحث الفكري الفوري — نافذة سينمائية (Command Palette):
 *  • زر بالهيدر + اختيار عالمي Cmd+K / Ctrl+K
 *  • بحث لحظي في العناوين والموجز والمتن مع مقاطع مطابقة
 *  • مُبرِز ذهبي للكلمات المطابقة (Highlighter)
 *  • تنقل كامل بلوحة المفاتيح: أسهم للتنقل، Enter للفتح، Esc للإغلاق
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

export default function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* الاختصار العالمي Cmd+K / Ctrl+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* التركيز عند الفتح + قفل تمرير الخلفية */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* بحث لحظي مراجَل */
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
        .then((d) => {
          setHits((d?.hits ?? []) as Hit[]);
          setActive(0);
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback(
    (slug: string) => {
      setOpen(false);
      setQ("");
      router.push(`/article/${slug}`);
    },
    [router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && hits[active]) {
        go(hits[active].slug);
      }
    },
    [hits, active, go],
  );

  /* إبقاء العنصر النشط مرئيًا */
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const terms = q.trim().split(/\s+/);

  return (
    <>
      {/* زر البحث — سطح المكتب */}
      <button
        onClick={() => setOpen(true)}
        title="البحث الفكري الفوري (Ctrl+K)"
        aria-label="البحث الفكري الفوري"
        className="hidden items-center gap-2 rounded-full p-2 transition-all hover:scale-110 hover:bg-[var(--accent-soft)] md:flex"
        style={{ color: "var(--ink)" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {/* زر البحث — الهاتف */}
      <button
        onClick={() => setOpen(true)}
        aria-label="البحث الفكري الفوري"
        className="rounded-full p-2.5 transition-colors active:bg-[var(--accent-soft)] md:hidden"
        style={{ color: "var(--ink)" }}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {/* النافذة السينمائية */}
      {open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="البحث في المنصة">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-4 top-[12vh] mx-auto max-w-2xl animate-fade-up overflow-hidden rounded-2xl border shadow-lift" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {/* حقل الإدخال */}
            <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: "var(--border)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="ابحث في العناوين والمتن والأفكار.."
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
                style={{ color: "var(--ink)" }}
                autoComplete="off"
              />
              <kbd className="hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] sm:block" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                Esc
              </kbd>
            </div>

            {/* النتائج */}
            <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
              {q.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
                  اكتب حرفين على الأقل ليبدأ البحث في كل مقالات المنصة..
                </p>
              ) : busy && hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm animate-pulse" style={{ color: "var(--ink-muted)" }}>
                  جارٍ البحث..
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
                  لا نتائج مطابقة — جرّب كلمات أخرى.
                </p>
              ) : (
                hits.map((h, i) => (
                  <button
                    key={h.slug}
                    onClick={() => go(h.slug)}
                    onMouseEnter={() => setActive(i)}
                    className="block w-full rounded-xl px-4 py-3 text-right transition-colors"
                    style={{ background: i === active ? "var(--accent-soft)" : "transparent" }}
                  >
                    <div className="flex items-center gap-2">
                      {h.section && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-soft)", color: h.sectionColor ?? "var(--accent-strong)" }}>
                          {h.section}
                        </span>
                      )}
                      <span className="truncate text-sm font-bold" style={{ color: "var(--ink)" }}>
                        <Highlight text={h.title} terms={terms} />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                      <Highlight text={h.snippet ?? h.summary} terms={terms} />
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* تلميحات التنقل */}
            <div className="flex items-center justify-between border-t px-4 py-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
              <span>↑↓ للتنقل · Enter للفتح</span>
              <span>بحث فوري في كل المنصة</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
