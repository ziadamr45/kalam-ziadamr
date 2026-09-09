"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "next-auth/react";

/**
 * ============================================================
 * تجربة التهيئة الموحدة والجولة التفاعلية الحية — للأعضاء الجدد حصريًا
 * ============================================================
 * المسار: نافذة شرائح تقديمية (3 شرائح) → جولة Spotlight حية بأربع
 * خطوات يمارس فيها العضو الواجهة بيده. الحالة محكومة بحقل قاعدة
 * بيانات حي (hasCompletedOnboarding) — تظهر مرة واحدة في العمر،
 * وتُختم بالإكمال أو التخطي فلا تتكرر نهائيًا.
 *
 * أمان SSR صارم: المكوّن لا يرسم شيئًا قبل الترطيب وحسم الجلسة
 * وفحص الحقل — لا تضارب ترطيب ولا وميض إطلاقًا.
 * تجاوب: كل خطوة تبحث عن هدفها المرئي؛ وعلى الشاشات التي يغيب
 * فيها العنصر (كجرس الهيدر على الهاتف) تُعرض بطاقة مركزية بنص بديل.
 */

type Stage = "idle" | "checking" | "slides" | "tour";

type TourStep = {
  /** محددات الهدف بالترتيب — أول عنصر مرئي يُختار */
  selectors: string[];
  title: string;
  text: string;
  /** نص الزر الأساسي */
  cta: string;
  /** هل يُقفل زر المتابعة حتى يلمس العضو الهدف بيده؟ */
  gateOnClick: boolean;
  /** نص بديل للشاشات التي يغيب فيها الهدف */
  fallbackText?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    selectors: ['[data-tour="account-avatar"]'],
    title: "حسابك وهويتك الفكرية",
    text: "اضغط هنا لمعاينة ملفك الشخصي والاطلاع على رصيد الأثر الخاص بك.",
    cta: "التالي",
    gateOnClick: true,
    fallbackText:
      "من زر «دخول» في الهيدر تصل إلى حسابك — ومن صورة حسابك بعد الدخول تجد ملفك الشخصي ورصيد الأثر.",
  },
  {
    selectors: ['[data-tour="notif-bell"]'],
    title: "جرس الإشعارات — نبض المنصة",
    text: "هنا نبض المنصة الفكري؛ اضغط على الجرس لتفعيل التنبيهات ومعرفة أين ستصلك تحديثات المقالات وردود التعليقات.",
    cta: "المتابعة",
    gateOnClick: false,
    fallbackText:
      "في هاتفك تجد جرس الإشعارات داخل قائمة التنقل الجانبية (☰) — من هناك تفعّل التنبيهات وتتابع كل أثر جديد.",
  },
  {
    selectors: ['[data-tour="search-btn"]'],
    title: "محرك البحث الفوري",
    text: "جرب البحث السريع؛ يمكنك عبره الوصول الفوري لأي فكرة أو مقال بالكلمات المفتاحية — أو بضغطة Ctrl+K في أي وقت.",
    cta: "التالي",
    gateOnClick: false,
    fallbackText:
      "زر البحث (العدسة) في الهيدر يفتح محرك البحث الفوري — ويمكنك استدعاؤه بـ Ctrl+K من أي صفحة.",
  },
  {
    selectors: ['[data-tour="first-article"]'],
    title: "ابدأ بصناعة أثرك",
    text: "ابدأ قراءة أول مقال، وتفاعل بنقاش هادف أو تعليق لتبدأ أولى خطواتك نحو رتبة «أهل الكلمة».",
    cta: "ابدأ رحلتك الفكرية الآن",
    gateOnClick: false,
  },
];

const SLIDES = [
  {
    glyph: "✦",
    title: "مرحبًا بك في «كلام له لازمة»",
    body: "منصة فكرية ومعرفية عربية، خالية من الضجيج وغنية بالعمق. هنا نزن الكلمة بميزان الأثر، ونهتم بنقاء الفكرة قبل كثرة السطور.",
  },
  {
    glyph: "⚖",
    title: "رحلة «رصيد الأثر» وقناة أهل الكلمة",
    body: "تفاعلك هنا يبني حضورك الفكري؛ القراءة الواعية والتعليقات الرصينة تمنحك نقاطًا في «رصيد الأثر». وصولك إلى 350 نقطة يفتح لك تلقائيًا باب «قناة أهل الكلمة» للمشاركة المباشرة في اقتراح وصياغة موضوعات المنصة.",
  },
  {
    glyph: "🔔",
    title: "الإشعارات والتحديثات الحية",
    body: "جرس الإشعارات في الهيدر هو نبض المنصة؛ ستصلك عليه تنبيهات المقالات الجديدة، تفاعل القراء مع كلماتك، وإشعارات الأمان. يمكنك تفعيل التنبيهات لتواكب كل أثر جديد فورًا.",
  },
];

export function OnboardingExperience() {
  const { status } = useSession();
  const [stage, setStage] = useState<Stage>("idle");
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState(0);
  const [satisfied, setSatisfied] = useState(false);
  /* مستطيل الهدف الحالي — null يعني بطاقة مركزية بلا تركيض ضوئي */
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dimmed, setDimmed] = useState(true);
  const finishingRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  /* ================= فحص أهلية التهيئة (حقل قاعدة البيانات الحي) ================= */
  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    setStage("checking");
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d: { needed?: boolean }) => {
        if (alive) setStage(d.needed ? "slides" : "idle");
      })
      .catch(() => {
        if (alive) setStage("idle");
      });
    return () => {
      alive = false;
    };
  }, [status]);

  /* ================= ختم التجربة — إكمالًا أو تخطيًا ================= */
  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setStage("idle");
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {}
    finishingRef.current = false;
  }, []);

  /* ================= قياس هدف الخطوة الحالية + تتبع الحركة ================= */
  const measure = useCallback(() => {
    if (stage !== "tour") return;
    const defs = TOUR_STEPS[step];
    let found: DOMRect | null = null;
    for (const sel of defs.selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      /* مرئي فعلًا: في مجرى العرض وبأبعاد حية وداخل منفذ العرض */
      if (el.offsetParent !== null && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
        found = r;
        break;
      }
    }
    setRect(found);
    if (found) {
      /* أدخل الهدف إلى مجال الرؤية فقط إن كان خارج الشاشة كليًا —
         لا نلمس عناصر الهيدر المثبتة (fixed) إطلاقًا فلا حلقات تمرير */
      if (found.bottom <= 0 || found.top >= window.innerHeight) {
        (document.querySelector(found_to_selector(defs)) as HTMLElement | null)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [stage, step]);

  useEffect(() => {
    if (stage !== "tour") return;
    setSatisfied(false);
    setDimmed(true);
    measure();
    const t1 = setTimeout(measure, 350); // بعد أي تمرير انسيابي
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    return () => {
      clearTimeout(t1);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [stage, step, measure]);

  /* ================= حارس النقر الشفاف — جوهر إصلاح علوق الجولة =================
     الحاوية الجذرية pointer-events-none فتصل النقرات للعناصر الحقيقية تحتها،
     وهذا الحارس (طور الالتقاط) ينظم ما يُسمح به:
     • نقرات بطاقة التوجيه نفسها: حرة دائمًا (أزرار التالي/تخطي).
     • النقر على الهدف المضيء: يمر للعنصر الحقيقي (يفتح القائمة/الجرس فعليًا)،
       وإن كانت الخطوة مروّضة (gate) سُجّل الإنجاز وخفّ التعتيم.
     • بقية الصفحة أثناء الترويد فقط: تُمنع مؤقتًا حفاظًا على تركيز الجولة،
       وتُحرَّر كليًا بعد تنفيذ الخطوة وفي الخطوات غير المروّضة. */
  useEffect(() => {
    if (stage !== "tour") return;
    const defs = TOUR_STEPS[step];
    const gating = defs.gateOnClick && !satisfied;
    const onCaptureClick = (e: MouseEvent) => {
      const probe = e.target as Element | null;
      if (!probe || !probe.closest) return;
      /* بطاقة التوجيه وأزرارها حرة دائمًا */
      if (cardRef.current && cardRef.current.contains(probe)) return;
      /* هل نقر العضو على الهدف المضيء نفسه؟ */
      for (const sel of defs.selectors) {
        const el = document.querySelector(sel);
        if (el && (el === probe || el.contains(probe))) {
          if (defs.gateOnClick) {
            setSatisfied(true);
            setDimmed(false); /* عند النجاح يخفّ التعتيم لتظهر القوائم المفتوحة بوضوح */
          }
          return; /* يمرّ النقر إلى العنصر الحقيقي دون أي اعتراض */
        }
      }
      if (gating) {
        /* أثناء انتظار تنفيذ الخطوة تُجمَّد بقية الصفحة مؤقتًا */
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onCaptureClick, true);
    return () => document.removeEventListener("click", onCaptureClick, true);
  }, [stage, step, satisfied]);

  const nextStep = useCallback(() => {
    /* أغلق أي قائمة فتحها العضو أثناء الخطوة (الجرس/الحساب/البحث يستجيبون لـ Escape) */
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      void finish();
    }
  }, [step, finish]);

  /* ================= لا شيء يُرسم قبل الحسم — أمان SSR ================= */
  if (stage === "idle" || stage === "checking") return null;

  /* ================= المرحلة الأولى: نافذة الشرائح ================= */
  if (stage === "slides") {
    const s = SLIDES[slide];
    const isLast = slide === SLIDES.length - 1;
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ترحيب بالعضو الجديد">
        <div className="absolute inset-0 backdrop-blur-md bg-zinc-950/80" onClick={isLast ? undefined : () => setSlide((v) => Math.min(SLIDES.length - 1, v + 1))} />

        <div
          className="relative w-full max-w-md overflow-hidden rounded-3xl border shadow-lift animate-fade-in"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {/* زر التخطي — متاح في كل مرحلة، يختم التجربة نهائيًا */}
          <button
            onClick={() => void finish()}
            className="absolute left-4 top-4 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            تخطي
          </button>

          <div className="px-7 pb-7 pt-12 text-center">
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {s.glyph}
            </div>
            <h2 className="font-ui text-xl font-bold leading-8" style={{ color: "var(--ink)" }}>
              {s.title}
            </h2>
            <p className="mt-4 min-h-[96px] text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
              {s.body}
            </p>

            {/* مؤشر التقدم النقطي */}
            <div className="mb-6 mt-2 flex items-center justify-center gap-2">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: i === slide ? 22 : 8,
                    background: i === slide ? "var(--accent)" : "var(--border)",
                  }}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-3">
              {slide > 0 && (
                <button
                  onClick={() => setSlide((v) => v - 1)}
                  className="rounded-full px-5 py-2.5 text-xs font-bold transition-colors"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  السابق
                </button>
              )}
              {!isLast ? (
                <button
                  onClick={() => setSlide((v) => v + 1)}
                  className="flex-1 rounded-full px-5 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]"
                  style={{ background: "var(--accent)" }}
                >
                  التالي
                </button>
              ) : (
                <button
                  onClick={() => {
                    setStage("tour");
                    setStep(0);
                  }}
                  className="flex-1 rounded-full px-4 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]"
                  style={{ background: "var(--accent)" }}
                >
                  خُض جولة سريعة لاكتشاف الواجهة بنفسك
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ================= المرحلة الثانية: الجولة الحية بتركيض الضوء ================= */
  const defs = TOUR_STEPS[step];
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const pad = 8;
  const tooltipW = Math.min(340, vw - 24);

  /* موضع البطاقة: أسفل الهدف أولًا، وإن ضاق المكان فأعلاه، وإن غاب الهدف فالمنتصف */
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + pad * 2 + 190 < vh;
    const centerX = Math.min(Math.max(rect.left + rect.width / 2, tooltipW / 2 + 12), vw - tooltipW / 2 - 12);
    tipStyle = below
      ? { top: rect.bottom + pad + 12, left: centerX, transform: "translateX(-50%)", width: tooltipW }
      : { top: Math.max(12, rect.top - pad - 200), left: centerX, transform: "translateX(-50%)", width: tooltipW };
  } else {
    tipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tooltipW };
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-label="جولة إرشادية تفاعلية"
    >
      {/* تركيض الضوء — القصّة الإضاءة عبر ظل هائل حول مستطيل الهدف */}
      {rect && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            borderRadius: 16,
            boxShadow: dimmed ? "0 0 0 9999px rgba(9,9,11,0.74)" : "0 0 0 9999px rgba(9,9,11,0.16)",
            border: "2px dashed rgba(245,158,11,0.6)",
            transition: "all .4s cubic-bezier(.4,0,.2,1)",
          }}
        />
      )}
      {/* تعتيم كامل حين يغيب الهدف (بطاقة مركزية) */}
      {!rect && <div className="absolute inset-0 bg-zinc-950/74" />}

      {/* بطاقة التوجيه — الوحيدة القابلة للنقر في الطبقة العائمة */}
      <div
        ref={cardRef}
        className="pointer-events-auto absolute rounded-2xl border p-5 shadow-lift animate-fade-in"
        style={{ ...tipStyle, background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <p className="mb-1 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>
          الخطوة {step + 1} من {TOUR_STEPS.length}
        </p>
        <h3 className="font-ui text-base font-bold" style={{ color: "var(--ink)" }}>
          {defs.title}
        </h3>
        <p className="mt-2 min-h-[60px] text-[13px] leading-7" style={{ color: "var(--ink-muted)" }}>
          {rect ? defs.text : defs.fallbackText ?? defs.text}
        </p>

        {/* شريط الخطوات النقطي */}
        <div className="mb-4 mt-3 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === step ? 18 : 6, background: i === step ? "var(--accent)" : "var(--border)" }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => void finish()}
            className="rounded-full px-3.5 py-2 text-[11px] font-bold transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            تخطي
          </button>
          <button
            onClick={nextStep}
            disabled={defs.gateOnClick && rect !== null && !satisfied}
            className="rounded-full px-5 py-2.5 text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-45"
            style={{ background: "var(--accent)" }}
          >
            {step === TOUR_STEPS.length - 1
              ? defs.cta
              : defs.gateOnClick && !satisfied && rect
                ? satisfied
                  ? "التالي"
                  : "نفّذ الخطوة أولًا"
                : defs.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

/* أداة داخلية: استرجاع أول محدد من تعريف الخطوة (لأجل scrollIntoView) */
function found_to_selector(defs: TourStep): string {
  for (const sel of defs.selectors) {
    const el = document.querySelector(sel);
    if (el && (el as HTMLElement).offsetParent !== null) return sel;
  }
  return defs.selectors[0];
}
