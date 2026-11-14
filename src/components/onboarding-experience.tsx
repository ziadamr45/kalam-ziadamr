"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * بطاقة الترحيب الفخمة — تجربة تهيئة واحدة هادئة للأعضاء الجدد.
 * - لا تُختم بالضغط العرضي على الخلفية، بل بزر «ابدأ رحلتك الفكرية» أو زر الإغلاق أو Escape.
 * - تستمع لحدث `kalam:replay-onboarding` لتُعرض فورًا دون إعادة تحميل الصفحة.
 */

type WelcomeCard = { icon: React.ReactNode; title: string; body: string };

function BookSoundIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 6.5c-1.8-1.6-4.4-2-7.5-1.7v13.4c3.1-.3 5.7.1 7.5 1.7 1.8-1.6 4.4-2 7.5-1.7V4.8c-3.1-.3-5.7.1-7.5 1.7Z" />
      <path d="M12 6.5V20" />
      <path d="M16.5 8.5c-1.2.2-2 .6-2.8 1.2M16.5 11.5c-1.2.2-2 .6-2.8 1.2" />
    </svg>
  );
}

function DialogueIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" />
    </svg>
  );
}

function ImpactIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3-2.3-1.2 2.3-1.2L12 8.5Z" />
    </svg>
  );
}

function FeatherMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.2 3.8c-5.8.4-10.5 4-12.5 9.4L3 21l7.9-4.7c5.4-2 9-6.7 9.3-12.5Z" />
      <path d="M6.5 17.5 13 11" />
    </svg>
  );
}

function buildCards(
  cfg: { title: string; text: string }[],
  threshold: number,
): WelcomeCard[] {
  const defaults: Array<{ icon: React.ReactNode; title: string; body: string }> = [
    {
      icon: <BookSoundIcon />,
      title: "اقرأ واستمع بالتشكيل",
      body: "قراءة متأنية واستماع بصوت مسموع للنص، مع التشكيل الحرفي الكامل بضغطة واحدة متى شئت.",
    },
    {
      icon: <DialogueIcon />,
      title: "محاورة ذكية وحوار نقي",
      body: "حاور ذكاءً يزن كلماتك، وشارك رأيك في مساحة رصينة محمية — بلا ضجيج ولا حسابات وهمية.",
    },
    {
      icon: <ImpactIcon />,
      title: "رصيد الأثر وأهل الكلمة",
      body: "كل قراءة وتعليق رصين يرفع رصيدك؛ وعند بلوغ 350 نقطة يُفتح لك باب «أهل الكلمة» للمشاركة في صياغة موضوعات المنصة.",
    },
  ];
  return defaults.map((d, i) => ({
    icon: d.icon,
    title: cfg[i]?.title ?? d.title,
    body: cfg[i]?.text ?? d.body.replace(/350/g, String(threshold)),
  }));
}

export function OnboardingExperience() {
  const { data: session, status } = useSession();
  const [stage, setStage] = useState<"idle" | "checking" | "ready">("idle");
  const [cfgCards, setCfgCards] = useState<{ title: string; text: string }[]>([]);
  const [cfgEnabled, setCfgEnabled] = useState(true);
  const [cfgThreshold, setCfgThreshold] = useState(350);
  const finishingRef = useRef(false);
  const userId = session?.user?.id ?? null;

  const checkEligibility = useCallback(() => {
    let alive = true;
    setStage("checking");
    Promise.all([
      fetch("/api/onboarding").then((r) => r.json()).catch(() => ({})),
      fetch("/api/public-config").then((r) => r.json()).catch(() => ({})),
    ]).then(([ob, cfg]) => {
      if (!alive) return;
      const c = cfg as {
        ONBOARDING_ENABLED?: boolean;
        ONBOARDING_SLIDES?: { title: string; text: string }[];
        IMPACT_ELDERS_THRESHOLD?: number;
      };
      if (c && Array.isArray(c.ONBOARDING_SLIDES) && c.ONBOARDING_SLIDES.length > 0) {
        setCfgCards(c.ONBOARDING_SLIDES.slice(0, 3));
      }
      if (typeof c?.IMPACT_ELDERS_THRESHOLD === "number" && c.IMPACT_ELDERS_THRESHOLD > 0) {
        setCfgThreshold(c.IMPACT_ELDERS_THRESHOLD);
      }
      if (c && c.ONBOARDING_ENABLED === false) {
        setCfgEnabled(false);
        setStage("idle");
        return;
      }
      setCfgEnabled(true);
      const d = ob as { needed?: boolean };
      setStage(d.needed ? "ready" : "idle");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    return checkEligibility();
  }, [status, userId, checkEligibility]);

  /* عرض فوري عند طلب إعادة الترحيب من الإعدادات دون إعادة تحميل */
  useEffect(() => {
    const onReplay = () => {
      setCfgEnabled(true);
      setStage("ready");
    };
    window.addEventListener("kalam:replay-onboarding", onReplay);
    return () => window.removeEventListener("kalam:replay-onboarding", onReplay);
  }, []);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setStage("idle");
    try {
      await fetch("/api/onboarding", { method: "POST" });
    } catch {}
    finishingRef.current = false;
  }, []);

  useEffect(() => {
    if (stage !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stage, finish]);

  if (stage !== "ready" || !cfgEnabled) return null;

  const cards = buildCards(cfgCards, cfgThreshold);
  const firstName = (session?.user?.name || "").trim().split(/\s+/)[0] || "";

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="ترحيب بالعضو الجديد">
      <div className="absolute inset-0 bg-zinc-950/55 backdrop-blur-sm animate-fade-in" />

      <div
        className="relative flex max-h-[calc(100dvh_-_1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border shadow-lift animate-fade-in sm:max-h-[calc(100dvh_-_2rem)]"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="pointer-events-none absolute inset-2.5 z-10 rounded-3xl" style={{ border: "1px solid var(--accent-soft)" }} aria-hidden />

        <button
          type="button"
          onClick={() => void finish()}
          aria-label="إغلاق الترحيب"
          className="absolute left-4 top-4 z-20 rounded-full p-2 transition-colors hover:bg-(--accent-soft)"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-7 sm:px-9 sm:pb-6 sm:pt-9">
          <div className="text-center">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl sm:mb-4 sm:h-16 sm:w-16"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              aria-hidden
            >
              <FeatherMark />
            </div>

            <p className="font-ui text-[11px] font-bold tracking-wide" style={{ color: "var(--accent-strong)" }}>
              كلام له لازمة
            </p>
            <h2 className="font-body mt-2 text-xl font-bold leading-8 sm:text-2xl sm:leading-9" style={{ color: "var(--ink)" }}>
              {firstName ? `أهلًا بك يا ${firstName}` : "أهلًا بك بين أهل الكلمة"}
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-xs leading-6 sm:mt-3 sm:text-[13px] sm:leading-7" style={{ color: "var(--ink-muted)" }}>
              منصة فكرية عربية نزن فيها الكلمة بميزان الأثر — وهذه أركانها الثلاثة في لمحة واحدة، ثم انطلق بحرّيتك كما تحب.
            </p>
          </div>

          <div className="mt-5 grid gap-2.5 text-right sm:mt-6 sm:grid-cols-3 sm:gap-3">
            {cards.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border p-3.5 sm:p-4"
                style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start gap-3 sm:block">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                    aria-hidden
                  >
                    {c.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                      {c.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-6 sm:mt-1.5" style={{ color: "var(--ink-muted)" }}>
                      {c.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t px-5 pb-4 pt-3.5 sm:px-9 sm:pb-5 sm:pt-4" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => void finish()}
            className="w-full rounded-full px-6 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] sm:py-3.5"
            style={{ background: "var(--accent)" }}
          >
            ابدأ رحلتك الفكرية
          </button>
          <p className="mt-2.5 text-center text-[10px]" style={{ color: "var(--ink-muted)" }}>
            ستظهر لك تلميحات خفيفة عند دخول أي ميزة لأول مرة فقط، دون إزعاج.
          </p>
        </div>
      </div>
    </div>
  );
}
