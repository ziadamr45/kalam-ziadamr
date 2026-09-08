"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";

type SizePreset = { key: string; label: string; w: number; h: number };
type CardVariant = "normal" | "quran" | "hadith";

const SIZES: SizePreset[] = [
  { key: "story", label: "ستوري ١٠٨٠×١٩٢٠", w: 1080, h: 1920 },
  { key: "square", label: "إنستجرام ١٠٨٠×١٣٥٠", w: 1080, h: 1350 },
  { key: "wide", label: "إكس ١٦٠٠×٩٠٠", w: 1600, h: 900 },
];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kalam-ziadamr.vercel.app";

/**
 * تصدير فائق النقاء — pixelRatio 3 (كريستالي لشاشات Retina).
 * حصانة iOS: حد ذاكرة كانفاس ≈ 16.7 مليون بكسل، لذا يُخفَّض النسبة
 * تلقائيًا للمقاسات الطويلة (ستوري) بدل أن تفرغ البطاقة صمتًا.
 */
function pixelRatioFor(w: number, h: number): number {
  const MAX_AREA = 16_400_000;
  return Math.min(3, Math.sqrt(MAX_AREA / (w * h)));
}

/** تنظيف وسوم الماركداون — تُرسم كنص صافٍ لا كأخطاء ظاهرة */
function stripMarkdown(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[«»\s]+/, "")
    .replace(/[«»\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** تحميل غلاف المقال — crossOrigin آمن، ويفشل بهدوء إلى خلفية متدرجة */
function loadCover(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** توليد رمز QR الموجه للمقال — بقع داكنة على أبيض لثبات المسح */
async function loadQR(url: string): Promise<HTMLImageElement | null> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 0,
      width: 512,
      errorCorrectionLevel: "M",
      color: { dark: "#14100B", light: "#FFFFFF" },
    });
    return await loadCover(dataUrl);
  } catch {
    return null;
  }
}

/**
 * محرك البطاقة السينمائية — يرسم في إحداثيات منطقية W×H ويضخّم ×3:
 * غلاف المقال ممتد كاملًا + ضبابية عازلة + تراكب دافئ عميق + vignette شعاعي
 * + إطار ذهبي داخلي بأركان مخطوطية هادئة + اقتباس أبيض ناصع بخط أميري
 * + تذييل بهوية المنصة ورمز QR موجّه للمقال.
 */
function drawQuoteCard(
  canvas: HTMLCanvasElement,
  opts: {
    quote: string;
    preset: SizePreset;
    variant: CardVariant;
    articleTitle: string;
    cover: HTMLImageElement | null;
    qr: HTMLImageElement | null;
  },
) {
  const { quote, preset, variant, articleTitle, cover, qr } = opts;
  const W = preset.w;
  const H = preset.h;
  const ratio = pixelRatioFor(W, H);
  canvas.width = Math.round(W * ratio);
  canvas.height = Math.round(H * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  const minWH = Math.min(W, H);
  const m = Math.round(minWH * 0.045); // هامش الإطار الداخلي (روح m-5)
  const radius = Math.round(minWH * 0.026);

  /* ============ ١) الخلفية السينمائية — الغلاف ممتد كاملًا ============ */
  const supportsFilter = typeof ctx.filter === "string";
  let drewCover = false;
  if (cover) {
    try {
      ctx.save();
      const scale =
        Math.max(W / cover.naturalWidth, H / cover.naturalHeight) *
        (supportsFilter ? 1.14 : 1.03); // أوفرسكان يخفي تفتت حواف الضبابية
      const dw = cover.naturalWidth * scale;
      const dh = cover.naturalHeight * scale;
      if (supportsFilter) {
        ctx.filter = "blur(14px) saturate(1.1) brightness(0.88)";
      }
      ctx.drawImage(cover, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.filter = "none";
      ctx.restore();
      drewCover = true;
    } catch {
      drewCover = false;
    }
  }
  if (!drewCover) {
    /* خلفية احتياطية فخمة — بني عتيق متوهج من القلب */
    const g = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, Math.max(W, H) * 0.75);
    g.addColorStop(0, "#2E2113");
    g.addColorStop(0.55, "#1B1309");
    g.addColorStop(1, "#0C0906");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ============ ٢) التراكب الدافئ العميق + تركيز الضوء ============ */
  ctx.fillStyle = "rgba(12,10,8,0.70)"; // bg-black/70 بلمسة دفء
  ctx.fillRect(0, 0, W, H);

  const vg = ctx.createRadialGradient(W / 2, H * 0.46, minWH * 0.16, W / 2, H * 0.5, Math.max(W, H) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.6, "rgba(0,0,0,0.10)");
  vg.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  /* تعتيم سفلي ناعم — يهيئ الأرضية للتذييل وQR */
  const floor = ctx.createLinearGradient(0, H * 0.6, 0, H);
  floor.addColorStop(0, "rgba(0,0,0,0)");
  floor.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  /* ============ ٣) الإطار الذهبي الداخلي + الأركان المخطوطية ============ */
  ctx.strokeStyle = "rgba(245,158,11,0.25)"; // amber-500/25
  ctx.lineWidth = 2.5;
  roundRect(ctx, m, m, W - m * 2, H - m * 2, radius);
  ctx.stroke();

  const c = m + Math.round(minWH * 0.016);
  const L = Math.round(minWH * 0.05);
  ctx.strokeStyle = "rgba(217,164,65,0.8)";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  const corner = (x: number, y: number, sx: number, sy: number) => {
    ctx.beginPath();
    ctx.moveTo(x + sx * L, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * L);
    ctx.stroke();
  };
  corner(c, c, 1, 1);
  corner(W - c, c, -1, 1);
  corner(c, H - c, 1, -1);
  corner(W - c, H - c, -1, -1);

  /* ============ ٤) هندسة التذييل قبل الاقتباس (لتحديد مساحة النص) ============ */
  const pad = Math.round(m * 0.9);
  const qrSize = Math.round(minWH * 0.115);
  const captionSize = Math.max(13, Math.round(minWH * 0.015));
  const qrX = qr ? W - m - pad - qrSize : 0;
  const qrY = qr ? H - m - pad - qrSize - captionSize - 6 : 0;
  const qrCenterY = qr ? qrY + qrSize / 2 : H - m - pad - minWH * 0.05;
  /* مركز عمود النص: يزاح قليلًا يسارًا ليتنفس بجوار QR */
  const textCx = qr ? ((m + pad) + (qrX - 26)) / 2 : W / 2;

  const brandSize = Math.round(minWH * 0.034);
  const taglineSize = Math.round(minWH * 0.021);
  const titleSize = Math.round(minWH * 0.027);

  const taglineY = qrCenterY + Math.round(taglineSize * 1.1);
  const brandY = qrCenterY + Math.round(brandSize * 0.15);
  const titleY = brandY - Math.round(brandSize * 1.5);
  const dividerY = titleY - Math.round(titleSize * 1.7);
  const quoteAreaBottom = dividerY - Math.round(minWH * 0.065);
  const quoteAreaTop = m + Math.round(minWH * 0.10);

  /* ============ ٥) نص الاقتباس — أبيض ناصع بخط أميري عريض ============ */
  const maxW = qr ? qrX - 26 - (m + pad) : W - m * 2 - Math.round(W * 0.09);
  const lineHFactor = variant === "quran" ? 2.15 : variant === "hadith" ? 2.0 : 1.95;
  let fontSize = Math.round(minWH * (variant === "quran" ? 0.056 : 0.06));
  const minFontSize = Math.round(minWH * 0.026);
  let lines: string[] = [];

  const wrap = (fs: number): string[] => {
    ctx.font =
      variant === "quran"
        ? `400 ${fs}px "Amiri Quran", "Amiri", serif`
        : variant === "hadith"
          ? `700 ${fs}px "Noto Naskh Arabic", "Amiri", serif`
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
    const needed = lines.length * fontSize * lineHFactor + fontSize * 2.6;
    if (needed <= quoteAreaBottom - quoteAreaTop || fontSize <= minFontSize) break;
    fontSize = Math.round(fontSize * 0.94);
  }

  const lineH = fontSize * lineHFactor;
  const blockH = lines.length * lineH;
  const areaCenter = (quoteAreaTop + quoteAreaBottom) / 2;
  const startY = areaCenter - blockH / 2 + fontSize * 0.4;

  /* علامتا الاقتباس الذهبيتان اللامعتان — تُوّجان النص وتختمانه بوقار */
  const goldGrad = ctx.createLinearGradient(0, quoteAreaTop, 0, quoteAreaBottom);
  goldGrad.addColorStop(0, "#F5D78E");
  goldGrad.addColorStop(0.5, "#D9A441");
  goldGrad.addColorStop(1, "#C08A16");
  const openMark = variant === "quran" ? "﴿" : "«";
  const closeMark = variant === "quran" ? "﴾" : "»";
  const markFont = (scale: number) => {
    ctx.font =
      variant === "quran"
        ? `400 ${Math.round(fontSize * scale)}px "Amiri Quran", "Amiri", serif`
        : `700 ${Math.round(fontSize * scale)}px "Amiri", serif`;
  };
  ctx.fillStyle = goldGrad;
  ctx.globalAlpha = 0.95;
  markFont(1.7);
  ctx.fillText(openMark, textCx, startY - fontSize * 1.5);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#FFFFFF"; // أبيض ناصع
  ctx.font =
    variant === "quran"
      ? `400 ${fontSize}px "Amiri Quran", "Amiri", serif`
      : variant === "hadith"
        ? `700 ${Math.round(fontSize * 0.92)}px "Noto Naskh Arabic", "Amiri", serif`
        : `700 ${fontSize}px "Amiri", serif`;
  ctx.shadowColor = "rgba(0,0,0,0.6)"; // ظل رقيق يرفع النص فوق الصورة
  ctx.shadowBlur = Math.round(fontSize * 0.22);
  ctx.shadowOffsetY = 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, textCx, startY + i * lineH);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = goldGrad;
  markFont(1.7);
  ctx.fillText(closeMark, textCx, startY + blockH + fontSize * 0.5);

  /* ============ ٦) التذييل — عنوان المقال + هوية المنصة + QR ============ */
  /* الخط الفاصل الذهبي المتلاشي */
  const ruleW = Math.round(maxW * 0.14);
  const grad = ctx.createLinearGradient(textCx - ruleW, 0, textCx + ruleW, 0);
  grad.addColorStop(0, "rgba(217,164,65,0)");
  grad.addColorStop(0.5, "rgba(217,164,65,0.85)");
  grad.addColorStop(1, "rgba(217,164,65,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(textCx - ruleW, dividerY, ruleW * 2, 3);

  /* عنوان المقال — رمادي فاتح هادئ */
  if (articleTitle.trim()) {
    ctx.fillStyle = "rgba(214,210,202,0.92)";
    ctx.font = `400 ${titleSize}px "Readex Pro", "Amiri", sans-serif`;
    let title = articleTitle.trim();
    while (ctx.measureText(title).width > maxW && title.length > 6) {
      title = title.slice(0, -3);
    }
    if (title !== articleTitle.trim()) title += "…";
    ctx.fillText(title, textCx, titleY);
  }

  /* هوية المنصة — اسم ذهبي + اللسان المميز */
  ctx.fillStyle = "#D9A441";
  ctx.font = `700 ${brandSize}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("كلام له لازمة", textCx, brandY);
  ctx.fillStyle = "rgba(196,192,184,0.8)";
  ctx.font = `400 ${taglineSize}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.", textCx, taglineY);

  /* رمز QR — بلاطة بيضاء مستديرة ظلّها يرفعها عن الخلفية */
  if (qr) {
    const tile = qrSize + Math.round(qrSize * 0.14);
    const tx = qrX - (tile - qrSize) / 2;
    const ty = qrY - (tile - qrSize) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, tx, ty, tile, tile, Math.round(tile * 0.12));
    ctx.fill();
    ctx.restore();
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = "rgba(217,164,65,0.85)";
    ctx.font = `500 ${captionSize}px "Readex Pro", "Amiri", sans-serif`;
    ctx.fillText("امسح الكود لقراءة المقال", qrX + qrSize / 2, H - m - pad - 4);
  }
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
  articleCover = null,
  containerSelector,
  suggestedQuotes = [],
}: {
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  articleCover?: string | null;
  containerSelector: string;
  suggestedQuotes?: string[];
}) {
  const { data: session } = useSession();
  const [selectedText, setSelectedText] = useState("");
  const [variant, setVariant] = useState<CardVariant>("normal");
  const [chipPos, setChipPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualQuote, setManualQuote] = useState("");
  const [size, setSize] = useState<SizePreset>(SIZES[1]);
  const [rendering, setRendering] = useState(false);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const chipGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  /* التقاط تحديد النص داخل جسم المقال */
  useEffect(() => {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        /* على اللمس: لمس الزر يُسقط التحديد قبل اكتمال النقر —
           مهلة قصيرة تُبقي الشريحة حية حتى يصل الحدث */
        if (chipGraceRef.current) clearTimeout(chipGraceRef.current);
        chipGraceRef.current = setTimeout(() => setChipPos(null), 450);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        if (chipGraceRef.current) clearTimeout(chipGraceRef.current);
        chipGraceRef.current = setTimeout(() => setChipPos(null), 450);
        return;
      }
      const text = sel.toString().trim().replace(/\s+/g, " ");
      if (text.length < 12 || text.length > 400) {
        if (chipGraceRef.current) clearTimeout(chipGraceRef.current);
        chipGraceRef.current = setTimeout(() => setChipPos(null), 450);
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
      if (chipGraceRef.current) clearTimeout(chipGraceRef.current);
      setChipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [containerSelector]);

  /* الرسم السينمائي — ينتظر الخطوط ثم الغلاف وQR ثم يرسم دفعة واحدة */
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    setRendering(true);
    const render = async () => {
      const cleanQuote = stripMarkdown(selectedText);
      const [cover, qrImg] = await Promise.all([
        loadCover(articleCover),
        loadQR(`${SITE_URL}/article/${articleSlug}`),
      ]);
      if (cancelled || !canvasRef.current) return;
      drawQuoteCard(canvasRef.current, {
        quote: cleanQuote,
        preset: size,
        variant,
        articleTitle: stripMarkdown(articleTitle),
        cover,
        qr: qrImg,
      });
      setRendering(false);
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(render).catch(render);
    } else {
      void render();
    }
    return () => {
      cancelled = true;
    };
  }, [open, selectedText, size, variant, articleTitle, articleCover, articleSlug]);

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

  /**
   * فتح المولد: بالتحديد المحفوظ إن وُجد — وإلا نافذة البديل الذكي.
   * onMouseDown preventDefault يمنع الزر من سرق التحديد عند اللمس/النقر.
   */
  const requestOpen = useCallback(() => {
    if (selectedText.trim().length >= 12) {
      setOpen(true);
    } else {
      setManualQuote("");
      setPickerOpen(true);
    }
  }, [selectedText]);

  const adoptQuote = useCallback((text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (clean.length < 12) return;
    setSelectedText(clean);
    setVariant("normal");
    setPickerOpen(false);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onTouchEnd={(e) => {
          e.preventDefault();
          requestOpen();
        }}
        onClick={requestOpen}
        className="rounded-full px-3 py-1.5 transition-all hover:bg-[var(--accent-soft)]"
        style={{ color: "var(--ink-muted)" }}
        title="حوّل أي جملة إلى بطاقة اقتباس جاهزة للمشاركة"
      >
        <span className="hidden sm:inline">اقتباسها ✦</span>
        <span className="sm:hidden">اقتباسها</span>
      </button>

      {/* الشريحة العائمة عند التحديد */}
      {chipPos && mounted && !open && (
        <div
          ref={chipRef}
          className="quote-chip fixed z-50 -translate-x-1/2 -translate-y-full"
          style={{ left: chipPos.x, top: chipPos.y }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onTouchEnd={(e) => {
              e.preventDefault();
              requestOpen();
            }}
            onClick={requestOpen}
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

              {/* المعاينة السينمائية */}
              <div className="relative mb-4 flex justify-center">
                <canvas
                  ref={canvasRef}
                  className="max-h-[46vh] w-auto max-w-full rounded-xl shadow-lift"
                  style={{ aspectRatio: `${size.w} / ${size.h}` }}
                />
                {rendering && (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-xl text-xs font-bold"
                    style={{ background: "rgba(0,0,0,0.35)", color: "#F5D78E" }}
                  >
                    جارٍ إعداد البطاقة..
                  </div>
                )}
              </div>

              <p className="mb-3 text-center text-[11px]" style={{ color: "var(--ink-muted)" }}>
                بطاقة سينمائية من غلاف المقال — بتصدير فائق النقاء ×٣ مع رمز QR يوجه القارئ إلى المقال
              </p>

              {/* المقاسات */}
              <div className="mb-4 grid grid-cols-3 gap-2">
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

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={download}
                  disabled={rendering}
                  className="rounded-xl px-4 py-3 text-sm font-bold shadow-soft transition-all hover:scale-[1.02] disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  تحميل الصورة
                </button>
                <button
                  onClick={shareNative}
                  disabled={rendering}
                  className="rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
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

      {/* نافذة البديل الذكي — تُفتح عند النقر بلا تحديد سابق */}
      {pickerOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border p-5 shadow-lift sm:rounded-3xl"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-ui font-bold" style={{ color: "var(--ink)" }}>
                  اختر جملة لبطاقة الاقتباس
                </h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  aria-label="إغلاق"
                  className="rounded-full p-2 transition-colors hover:bg-[var(--accent-soft)]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <p className="mb-4 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                ظلّل أي جملة في المقال لالتقاطها تلقائيًا — أو اختر من الاقتباسات الجوهرية أدناه، أو اكتبها بنفسك.
              </p>

              {/* الاقتباسات المنتقاة تلقائيًا من المقال */}
              {suggestedQuotes.length > 0 && (
                <div className="mb-4 space-y-2">
                  {suggestedQuotes.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => adoptQuote(q)}
                      className="block w-full rounded-2xl border px-4 py-3 text-right text-sm leading-7 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                    >
                      <span style={{ color: "var(--accent-strong)" }}>«</span>
                      {q.length > 140 ? `${q.slice(0, 140)}…` : q}
                      <span style={{ color: "var(--accent-strong)" }}>»</span>
                    </button>
                  ))}
                </div>
              )}

              {/* الكتابة أو اللصق اليدوي */}
              <div>
                <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
                  أو اكتب الجملة التي تريد اقتباسها
                </label>
                <textarea
                  value={manualQuote}
                  onChange={(e) => setManualQuote(e.target.value)}
                  rows={3}
                  maxLength={400}
                  placeholder="الصق هنا الجملة التي ألهمتك.."
                  className="w-full resize-none rounded-xl border bg-transparent p-3 text-sm leading-7 outline-none transition-colors focus:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", color: "var(--ink)" }}
                />
                <button
                  onClick={() => adoptQuote(manualQuote)}
                  disabled={manualQuote.trim().length < 12}
                  className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold shadow-soft transition-all hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  إنشاء البطاقة
                </button>
              </div>
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
