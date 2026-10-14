"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * ============================================================
 * القفز البحثي داخل المقال — يُكمل رحلة القارئ من نتائج البحث
 * ============================================================
 * عندما يصل القارئ من نتائج البحث إلى /article/…?q=كلمة:
 *   1. تُظلَّل كل مطابقات كلمة البحث في المتن (ذهبي هادئ) — حتى لو كان
 *      النص مشكولًا (المطابقة تجرّد الحركات من الطرفين قبل المقارنة).
 *   2. يقفز القارئ تلقائيًا إلى أول مطابقة (وهي مصدر المقتطف الذي رآه
 *      في نتائج البحث) بموضع مريح فوق رأسه بمسافة كافية.
 *   3. كبسولة عائمة فوق شريط الأدوات تعرض «٣ من ٧» وتتيح التنقل بين
 *      المطابقات سابقًا/تاليًا أو إنهاء التظليل بمسح معامل البحث.
 *
 * التقنية: CSS Custom Highlight API — تظليل بلا أي جراحة في DOM
 * (صديق تمامًا لـ React وكلمات الكاريوكي <span data-wi>)، مع ملاذ
 * احتياطي بوسم <mark> للمتصفحات القديمة التي لا تملك الواجهة.
 */

/* مطابقة متسامية: تجريد الحركات والمدّ والنتينة + توحيد حالة اللاتيني */
const SKIP_RE = /[\u064B-\u0658\u0670\u0640\u00A0]/;

function normalizeChar(ch: string): string {
  if (SKIP_RE.test(ch)) return ch === "\u00A0" ? " " : "";
  return ch.toLowerCase();
}

type TextSeg = {
  node: Text;
  /** فهرس بداية هذه العقدة داخل النص المُطبَّع العام */
  normStart: number;
  /** طول الجزء المُطبَّع من هذه العقدة */
  normLen: number;
  /** خريطة: فهرس الحرف الأصلي ← فهرسه المُطبَّع المحلي (-1 لما يُجرّد) */
  map: number[];
};

/** خريطة نصية للجذور كلها: النص المُطبَّع + مواضع كل عقدة نصية فيه.
 *  فاصل «\n» يُزرع بين الكتل والجذور المختلفة كي لا تتم مطابقة عابرة لحدودها.
 *  عقد المسافات البيضاء بين الكلمات المضمنة تُقبل — بدونها لا تطابق أبدًا
 *  استعلام متعدد الكلمات (كل كلمة في span مستقل). */
function buildTextMap(roots: HTMLElement[]): { norm: string; segs: TextSeg[] } {
  let norm = "";
  const segs: TextSeg[] = [];
  let lastBlock: Element | null = null;
  for (const root of roots) {
    if (norm) {
      norm += "\n";
      lastBlock = null;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n: Node) {
        const p = n.parentElement;
        if (!p || p.closest("script,style,code,data,mark")) return NodeFilter.FILTER_REJECT;
        return (n.textContent ?? "").length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let current: Node | null;
    while ((current = walker.nextNode())) {
      const node = current as Text;
      const raw = node.textContent ?? "";
      const block =
        node.parentElement?.closest(
          "p,h1,h2,h3,h4,h5,blockquote,li,td,th,figcaption,aside",
        ) ?? root;
      if (lastBlock && block !== lastBlock) norm += "\n";
      lastBlock = block;
      const normStart = norm.length;
      const map: number[] = new Array(raw.length).fill(-1);
      for (let i = 0; i < raw.length; i++) {
        const c = normalizeChar(raw[i]);
        if (c) {
          map[i] = norm.length - normStart;
          norm += c;
        }
      }
      segs.push({ node, normStart, normLen: norm.length - normStart, map });
    }
  }
  return { norm, segs };
}

/** تحويل فهرس مُطبَّع عام إلى (عقدة نصية، فهرس حرف أصلي) */
function locate(segs: TextSeg[], globalNorm: number): { node: Text; charIndex: number } | null {
  for (const s of segs) {
    const local = globalNorm - s.normStart;
    if (local < 0 || local >= s.normLen) continue;
    const charIndex = s.map.indexOf(local);
    if (charIndex >= 0) return { node: s.node, charIndex };
  }
  return null;
}

/** كل مواضع الإبرة داخل النص المُطبَّع — كنطاقات DOM حية */
function findRanges(norm: string, needle: string, segs: TextSeg[]): Range[] {
  const ranges: Range[] = [];
  if (!needle) return ranges;
  const lower = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const at = norm.indexOf(lower, from);
    if (at < 0) break;
    from = at + 1;
    const end = at + lower.length;
    if (norm.indexOf("\n", at) >= 0 && norm.indexOf("\n", at) < end) continue; // عابرة لحد كتلة
    const startLoc = locate(segs, at);
    const endLoc = locate(segs, end - 1);
    if (!startLoc || !endLoc) continue;
    try {
      const r = document.createRange();
      r.setStart(startLoc.node, startLoc.charIndex);
      r.setEnd(endLoc.node, endLoc.charIndex + 1);
      ranges.push(r);
    } catch {
      /* عقدة غابت بين اللحظات — نتجاهل هذا الموضع */
    }
  }
  return ranges;
}

type HighlightRegistry = Map<string, unknown>;

/** تسجيل التظليل عبر CSS Custom Highlight API إن توفرت */
function applyHighlights(ranges: Range[], activeIdx: number) {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  if (!css.highlights) return;
  const Ctor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!Ctor) return;
  try {
    css.highlights.set("kalam-search-hit", new Ctor(...ranges));
    css.highlights.set(
      "kalam-search-hit-active",
      ranges[activeIdx] ? new Ctor(ranges[activeIdx]) : new Ctor(),
    );
  } catch {
    /* لا شيء — المتصفح سيعود بلا تظليل */
  }
}

/** ملاذ المتصفحات القديمة: لفّ المطابقات داخل عقدة نصية واحدة بوسم mark */
function applyMarkFallback(container: HTMLElement, ranges: Range[], activeIdx: number) {
  ranges.forEach((r, i) => {
    if (r.startContainer !== r.endContainer || r.startContainer.nodeType !== Node.TEXT_NODE) return;
    const mark = document.createElement("mark");
    mark.setAttribute("data-search-hit", i === activeIdx ? "active" : "1");
    try {
      r.surroundContents(mark);
    } catch {
      /* نطاق عابر — يُترك بلا تظليل في هذا الملاذ */
    }
  });
  void container;
}

/** مسح كل أثر للتظليل — سجل الواجهة + أي وسوم mark من الملاذ الاحتياطي */
function clearAllHighlights(container: HTMLElement | null) {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  css.highlights?.delete("kalam-search-hit");
  css.highlights?.delete("kalam-search-hit-active");
  container?.querySelectorAll("mark[data-search-hit]").forEach((m) => {
    const p = m.parentNode;
    if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    m.remove();
    if (typeof p.normalize === "function") p.normalize();
  });
}

/** تمرير ناعم يضع المطابقة على ثلث الشاشة العلوي — بعيدًا عن الهيدر والحواف */
function scrollToRange(r: Range) {
  const rect = r.getBoundingClientRect();
  if (!rect || (rect.top === 0 && rect.bottom === 0)) return;
  const offset = Math.max(110, Math.round(window.innerHeight * 0.3));
  const target = Math.max(0, window.scrollY + rect.top - offset);
  const root = document.documentElement.style;
  const prev = root.scrollBehavior;
  root.scrollBehavior = "auto";
  window.scrollTo({ top: target });
  root.scrollBehavior = prev;
}

export default function SearchJump({ version }: { version?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [matches, setMatches] = useState<Range[] | null>(null);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);
  /* ذاكرة المصطلح المطبَّق والموضع النشط — لكي يُعيد تبديل التشكيل البناء
     في نفس المطابقة دون خطف القارئ من مكانه إلى أول قائمة */
  const lastQRef = useRef<string | null>(null);
  const activeIdxRef = useRef(0);

  const clearNow = useCallback(() => {
    clearAllHighlights(containerRef.current ?? document.getElementById("article-body"));
  }, []);

  /* المحرك الأساسي: مسح المتن والعنوان وتظليل المطابقات والقفز لأولها */
  useEffect(() => {
    const term = q.trim();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    setMatches(null);
    clearNow();

    if (term.length >= 2) {
      timer = setTimeout(() => {
        if (cancelled) return;
        const body = document.getElementById("article-body");
        const title = document.querySelector("article h1");
        const roots: HTMLElement[] = [];
        /* ترتيب القراءة البصري حرفيًا: العنوان أعلى الصفحة فيُمسح أولًا كي تكون
           مطابقاته «الأولى» في العدّ، ثم المتن بترتيبه — فلا تخرج كبسولة
           «٦ من ٦» وتقفز القارئ إلى أعلى الصفحة في آخر خطوة تنقل */
        if (title) roots.push(title as HTMLElement);
        if (body) roots.push(body);
        if (!roots.length) return;
        containerRef.current = body;
        const { norm, segs } = buildTextMap(roots);
        const needle = Array.from(term).map(normalizeChar).join("");
        const ranges = findRanges(norm, needle, segs);
        if (!ranges.length) return;

        /* نفس المصطلح (تبديل تشكيل مثلًا): تثبيت الموضع بلا إعادة قفز */
        const sameTerm = lastQRef.current === term;
        const keep = sameTerm ? Math.min(activeIdxRef.current, ranges.length - 1) : 0;
        lastQRef.current = term;
        activeIdxRef.current = keep;

        const supportsHl =
          "highlights" in (CSS as unknown as Record<string, unknown>) &&
          "Highlight" in window;
        if (supportsHl) applyHighlights(ranges, keep);
        else if (body) applyMarkFallback(body, ranges, keep);

        setMatches(ranges);
        setActive(keep);

        /* القفزة الأولى فقط: بعد استقرار الرسم (rAF مزدوج) ثم هامش زمني لتبادل الخطوط */
        if (!sameTerm) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              scrollToRange(ranges[keep]);
            });
          });
        }
      }, 350);
    } else {
      lastQRef.current = null;
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearNow();
    };
  }, [q, version, clearNow]);

  /* تحديث المطابقة النشطة في سجل التظليل عند التنقل */
  useEffect(() => {
    if (!matches?.length) return;
    const supportsHl =
      "highlights" in (CSS as unknown as Record<string, unknown>) && "Highlight" in window;
    if (supportsHl) applyHighlights(matches, active);
    else {
      /* في الملاذ الاحتياطي نعيد اللف كله — أرخص من تتبع الوسوم فرديًا */
      const container = containerRef.current ?? document.getElementById("article-body");
      if (!container) return;
      clearAllHighlights(container);
      applyMarkFallback(container, matches, active);
    }
  }, [matches, active]);

  const goTo = useCallback(
    (i: number) => {
      if (!matches?.length) return;
      const next = ((i % matches.length) + matches.length) % matches.length;
      activeIdxRef.current = next;
      setActive(next);
      const r = matches[next];
      if (r) requestAnimationFrame(() => scrollToRange(r));
    },
    [matches],
  );

  const close = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  /* الكبسولة العائمة — لا شيء يُرسم بلا مطابقات */
  if (!matches || matches.length === 0) return null;

  const ar = (n: number) => n.toLocaleString("ar-EG");

  return (
    <div
      className="no-print pointer-events-none fixed inset-x-0 bottom-[68px] z-40 flex justify-center px-3"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border px-1.5 py-1 shadow-lift"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => goTo(active - 1)}
          aria-label="المطابقة السابقة"
          title="المطابقة السابقة"
          className="rounded-full p-1.5 transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        <span
          className="min-w-[4.75rem] text-center text-xs font-bold tabular-nums"
          style={{ color: "var(--ink)" }}
        >
          {ar(active + 1)} من {ar(matches.length)}
        </span>
        <button
          onClick={() => goTo(active + 1)}
          aria-label="المطابقة التالية"
          title="المطابقة التالية"
          className="rounded-full p-1.5 transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="mx-0.5 h-5 w-px shrink-0" style={{ background: "var(--border)" }} aria-hidden />
        <button
          onClick={close}
          aria-label="إنهاء التظليل وإخفاء الكبسولة"
          title="إنهاء التظليل"
          className="rounded-full p-1.5 transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
