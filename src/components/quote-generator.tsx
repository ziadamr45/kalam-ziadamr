"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";

type SizePreset = { key: string; label: string; w: number; h: number };
type CardTheme = "paper" | "night";
type CardVariant = "normal" | "quran" | "hadith";

const SIZES: SizePreset[] = [
  { key: "story", label: "ستوري ١٠٨٠×١٩٢٠", w: 1080, h: 1920 },
  { key: "square", label: "إنستجرام ١٠٨٠×١٣٥٠", w: 1080, h: 1350 },
  { key: "wide", label: "إكس ١٦٠٠×٩٠٠", w: 1600, h: 900 },
];

const THEMES: Record<CardTheme, { bg: string; ink: string; accent: string; muted: string }> = {
  paper: { bg: "#FDFBF7", ink: "#1C1917", accent: "#A16A1F", muted: "#8A847B" },
  night: { bg: "#0B1120", ink: "#E5E3DF", accent: "#D9A441", muted: "#94A3B8" },
};

/**
 * رسم بطاقة الاقتباس على Canvas بدعم RTL كامل:
 * لف كلمات، علامتا اقتباس، خط نحاسي، تذييل الهوية.
 * متمايز للآيات (﴿ ﴾ + خط الرسم العثماني) وللأحاديث (خط النسخ الكلاسيكي).
 */
function drawQuoteCard(
  canvas: HTMLCanvasElement,
  quote: string,
  preset: SizePreset,
  theme: CardTheme,
  variant: CardVariant,
) {
  const t = THEMES[theme];
  const W = preset.w;
  const H = preset.h;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(1, 1);
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  // الخلفية
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  // نمط نقاط خفيف
  ctx.fillStyle = theme === "paper" ? "rgba(161,106,31,0.05)" : "rgba(217,164,65,0.05)";
  const gap = 46;
  for (let y = gap / 2; y < H; y += gap) {
    for (let x = gap / 2; x < W; x += gap) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // إطار داخلي رفيع
  ctx.strokeStyle = t.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  const m = Math.round(Math.min(W, H) * 0.045);
  const r = 28;
  roundRect(ctx, m, m, W - m * 2, H - m * 2, r);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // نص الاقتباس — لف الكلمات بمقاس متكيّف
  const maxW = W - m * 2 - Math.round(W * 0.09);
  const lineHFactor = variant === "quran" ? 2.15 : 1.85;
  let fontSize = Math.round(Math.min(W, H) * (variant === "quran" ? 0.058 : 0.062));
  const minFontSize = Math.round(Math.min(W, H) * 0.026);
  let lines: string[] = [];

  const wrap = (fs: number): string[] => {
    ctx.font =
      variant === "quran"
        ? `400 ${fs}px "Amiri Quran", "Amiri", serif`
        : `700 ${fs}px "Amiri", serif`;
    const words = quote.split(/\s+/);
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
    return out;
  };

  for (;;) {
    lines = wrap(fontSize);
    const lineH = fontSize * lineHFactor;
    const needed = lines.length * lineH + fontSize;
    if (needed <= H - m * 2 - Math.round(H * 0.16) || fontSize <= minFontSize) break;
    fontSize = Math.round(fontSize * 0.94);
  }

  const lineH = fontSize * lineHFactor;
  const blockH = lines.length * lineH;
  const startY = H / 2 - blockH / 2 + fontSize * 0.4;

  // علامتا الاقتباس — قرآنية ﴿ أو راقية «
  const openMark = variant === "quran" ? "﴿" : "«";
  const closeMark = variant === "quran" ? "﴾" : "»";
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.9;
  ctx.font =
    variant === "quran"
      ? `400 ${Math.round(fontSize * 1.5)}px "Amiri Quran", "Amiri", serif`
      : `700 ${Math.round(fontSize * 1.6)}px Amiri, serif`;
  ctx.fillText(openMark, W / 2, startY - fontSize * 1.5);
  ctx.globalAlpha = 1;

  // السطور
  ctx.fillStyle = t.ink;
  ctx.font =
    variant === "quran"
      ? `400 ${fontSize}px "Amiri Quran", "Amiri", serif`
      : variant === "hadith"
        ? `700 ${fontSize * 0.92}px "Noto Naskh Arabic", "Amiri", serif`
        : `700 ${fontSize}px Amiri, serif`;
  ctx.shadowColor = theme === "night" ? "rgba(0,0,0,0.4)" : "rgba(28,25,23,0.06)";
  ctx.shadowBlur = 0;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lineH);
  });

  // علامة الإغلاق
  ctx.fillStyle = t.accent;
  ctx.font =
    variant === "quran"
      ? `400 ${Math.round(fontSize * 1.5)}px "Amiri Quran", "Amiri", serif`
      : `700 ${Math.round(fontSize * 1.6)}px Amiri, serif`;
  ctx.fillText(closeMark, W / 2, startY + blockH + fontSize * 0.5);

  // الخط الفاصل النحاسي
  const ruleY = H - Math.round(H * 0.11);
  const ruleW = Math.round(W * 0.12);
  const grad = ctx.createLinearGradient(W / 2 - ruleW, 0, W / 2 + ruleW, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, t.accent);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(W / 2 - ruleW, ruleY, ruleW * 2, 4);

  // التذييل — الهوية
  ctx.fillStyle = t.ink;
  ctx.font = `700 ${Math.round(Math.min(W, H) * 0.032)}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("كلام له لازمة", W / 2, ruleY + Math.round(H * 0.055));
  ctx.fillStyle = t.muted;
  ctx.font = `400 ${Math.round(Math.min(W, H) * 0.02)}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.", W / 2, ruleY + Math.round(H * 0.088));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function QuoteGenerator({
  articleId,
  articleTitle,
  articleSlug,
  containerSelector,
}: {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  containerSelector: string;
}) {
  const { data: session } = useSession();
  const [selectedText, setSelectedText] = useState("");
  const [variant, setVariant] = useState<CardVariant>("normal");
  const [chipPos, setChipPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<SizePreset>(SIZES[1]);
  const [theme, setTheme] = useState<CardTheme>("paper");
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  /* التقاط تحديد النص داخل جسم المقال */
  useEffect(() => {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setChipPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setChipPos(null);
        return;
      }
      const text = sel.toString().trim().replace(/\s+/g, " ");
      if (text.length < 12 || text.length > 400) {
        setChipPos(null);
        return;
      }
      /* كشف السياق: هل التحديد داخل آية أو حديث؟ */
      const node = range.startContainer;
      const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement | null);
      const closest = el?.closest?.(".quran-block, .hadith-block");
      setVariant(
        closest?.classList.contains("quran-block")
          ? "quran"
          : closest?.classList.contains("hadith-block")
            ? "hadith"
            : "normal",
      );
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setChipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [containerSelector]);

  /* الرسم عند فتح المودال أو تغيير الخيارات */
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !canvasRef.current) return;
      drawQuoteCard(canvasRef.current, selectedText, size, theme, variant);
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(render).catch(render);
    } else {
      render();
    }
    return () => {
      cancelled = true;
    };
  }, [open, selectedText, size, theme, variant]);

  /**
   * خطاف «حفظ ومشاركة الاقتباس» (+3 أثر — مرتان يوميًا بسقف خادمي):
   * صامت تمامًا للزائر وفاشل التسجيل — لا يمس تجربة المشاركة أبدًا.
   */
  const [impactNote, setImpactNote] = useState("");
  const trackImpact = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch("/api/impact/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "QUOTE_SHARE", articleId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.awarded) setImpactNote(`+${data.points} سُجّلت في رصيد أثرك`);
    } catch {}
  }, [articleId, session?.user?.id]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `quote-kalam-${articleSlug}-${size.key}.png`;
    a.click();
    trackShareBySlug(articleSlug, "quote-download", selectedText.length);
    void trackImpact();
  }, [articleSlug, size.key, selectedText.length, trackImpact]);

  const shareNative = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    trackShareBySlug(articleSlug, "quote-share", selectedText.length);
    void trackImpact();
    if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "quote.png", { type: "image/png" })] })) {
      try {
        await navigator.share({
          files: [new File([blob], "quote.png", { type: "image/png" })],
          text: selectedText,
          title: articleTitle,
        });
        return;
      } catch {}
    }
    // fallback: نسخ النص
    try {
      await navigator.clipboard.writeText(`«${selectedText}» — كلام له لازمة`);
      alert("تم نسخ الاقتباس.. الصقه حيث تريد.");
    } catch {}
  }, [articleSlug, articleTitle, selectedText, trackImpact]);

  return (
    <>
      <button
        onClick={() => {
          if (!selectedText) {
            alert("ظلّل أولًا الجملة التي ألهمتك داخل المقال، ثم اضغط «اقتباسها».");
            return;
          }
          setOpen(true);
        }}
        className="rounded-full px-3 py-1.5 transition-all hover:bg-[var(--accent-soft)]"
        style={{ color: "var(--ink-muted)" }}
        title="حوّل أي جملة إلى بطاقة اقتباس جاهزة للمشاركة"
      >
        اقتباسها ✦
      </button>

      {/* الشريحة العائمة عند التحديد */}
      {chipPos && mounted && !open && (
        <div
          ref={chipRef}
          className="quote-chip fixed z-50 -translate-x-1/2 -translate-y-full"
          style={{ left: chipPos.x, top: chipPos.y }}
        >
          <button
            onClick={() => setOpen(true)}
            className="rounded-full px-4 py-2 text-xs font-bold shadow-lift transition-transform hover:scale-105"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            اقتباسها
          </button>
        </div>
      )}

      {/* المودال */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          >
            <div
              className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border p-5 shadow-lift"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-ui font-bold" style={{ color: "var(--ink)" }}>
                  {variant === "quran"
                    ? "بطاقة الآية الكريمة"
                    : variant === "hadith"
                      ? "بطاقة الحديث الشريف"
                      : "بطاقة الاقتباس"}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                  className="rounded-full p-2 transition-colors hover:bg-[var(--accent-soft)]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {/* المعاينة */}
              <div className="mb-4 flex justify-center">
                <canvas
                  ref={canvasRef}
                  className="max-h-[46vh] w-auto max-w-full rounded-xl shadow-soft"
                  style={{ aspectRatio: `${size.w} / ${size.h}` }}
                />
              </div>

              {/* المقاسات */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSize(s)}
                    className="rounded-xl border px-2 py-2 text-[11px] font-semibold transition-all"
                    style={
                      size.key === s.key
                        ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                        : { color: "var(--ink-muted)", borderColor: "var(--border)" }
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* الثيمات */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(["paper", "night"] as CardTheme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className="rounded-xl border px-2 py-2 text-xs font-semibold transition-all"
                    style={
                      theme === t
                        ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                        : { color: "var(--ink-muted)", borderColor: "var(--border)" }
                    }
                  >
                    {t === "paper" ? "ثيم ورقي" : "ثيم ليلي"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={download}
                  className="rounded-xl px-4 py-3 text-sm font-bold shadow-soft transition-all hover:scale-[1.02]"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  تحميل الصورة
                </button>
                <button
                  onClick={shareNative}
                  className="rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                  style={{ color: "var(--accent-strong)", borderColor: "var(--accent)" }}
                >
                  مشاركة
                </button>
              </div>

              {impactNote && (
                <p className="mt-3 text-center text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>
                  ✦ {impactNote}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* تسجيل المشاركة */
function trackShareBySlug(slug: string, platform: string, quoteLen: number) {
  // استخراج articleId يتم في الخادم عبر slug — هنا نرسل slug كمرجع
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "share", slug, platform, quoteLen }),
    keepalive: true,
  }).catch(() => {});
}
