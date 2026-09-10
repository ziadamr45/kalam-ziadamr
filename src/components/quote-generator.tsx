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
  { key: "post", label: "مربع ١٠٨٠×١٠٨٠", w: 1080, h: 1080 },
  { key: "wide", label: "إكس ١٦٠٠×٩٠٠", w: 1600, h: 900 },
];

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kalam-ziadamr.vercel.app";

/** سقف كلمات الاقتباس — سعة البطاقة البصرية المريحة (قرار تصميمي مثبت) */
const MAX_QUOTE_WORDS = 25;
const MIN_QUOTE_CHARS = 12;

/** عدّ كلمات النص بعد تطبيعه — المرجع الموحد لكل البوابات */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

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

  /* القاعدة الصلبة الأساسية — أرضية داكنة صلبة قبل أي رسم أو صورة:
     تمنع أي عيوب شفافية في الـ PNG المصدّر عند المعالجة المتكررة
     أو عند غلاف بصيغة PNG شفافة */
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, W, H);

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

  /* ============ ٤) هندسة التدفق الصريح — الفوتر يُحسب أولًا ثم مساحة الاقتباس ============
     كل سطر يقف على مسار مقيس صراحةً (bottom-up flow) — لا إحداثيات عشوائية
     ولا تمركز حول عناصر مجاورة، فلا التصاق أسطر مهما اختلف المقاس */
  const pad = Math.round(m * 0.9);
  const footerBottom = H - m - pad;

  /* مقاسات الفوتر — نظيرات أحرف Tailwind المطلوبة */
  const captionSize = Math.max(12, Math.round(minWH * 0.0145)); // «امسح للقراءة» — text-[9px]
  const taglineSize = Math.round(minWH * 0.0245); // اللسان — text-[10px]
  const brandSize = Math.round(minWH * 0.041); // الاسم — text-base font-bold
  const titleSize = Math.round(minWH * 0.031); // العنوان — text-xs

  const captionBaseline = footerBottom - Math.round(captionSize * 0.3);

  /* بلاطة QR — يسار الفوتر (الموضع المخصص)، وتعليقها تحتها بمسافة آمنة */
  const qrSize = Math.round(minWH * 0.112);
  const tile = qrSize + Math.round(qrSize * 0.26); // خلفية بيضاء بحواف ناعمة — p-1.5
  const tileBottom = captionBaseline - Math.round(captionSize * 1.3); // mt-1.5 + فاصل آمن
  const tileTop = tileBottom - tile;
  const tileX = m + pad;
  const captionCx = tileX + tile / 2;

  /* كتلة النص الثلاثية — يمين الفوتر، قاعدتها مصفوفة مع قاعدة البلاطة (items-end) */
  const textRight = W - m - pad;
  const taglineBaseline = tileBottom + Math.round(taglineSize * 0.05);
  const brandBaseline = taglineBaseline - Math.round(taglineSize * 1.0 + brandSize * 0.6);
  const titleBaseline = brandBaseline - Math.round(brandSize * 0.85 + titleSize * 0.5);
  const titleTop = titleBaseline - Math.round(titleSize);
  const sepY = titleTop - Math.round(minWH * 0.032); // pt-6 ثم border-t فوق الكتلة

  /* فاصل أفقي آمن بين كتلة النص وبلاطة QR */
  const footerMaxW = textRight - (tileX + tile) - Math.round(minWH * 0.05);

  const quoteAreaBottom = sepY - Math.round(minWH * 0.055);
  const quoteAreaTop = m + Math.round(minWH * 0.075);

  /* ============ ٥) نص الاقتباس — أبيض ناصع بخط أميري عريض ============ */
  const maxW = W - m * 2 - Math.round(W * 0.075);
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

  /* المساحة المطلوبة = السطور + القوسان وفراغاهما الجمالية — كتلة واحدة تُقاس وتتمركز */
  for (;;) {
    lines = wrap(fontSize);
    const needed = (lines.length - 1) * fontSize * lineHFactor + fontSize * 4.6;
    if (needed <= quoteAreaBottom - quoteAreaTop || fontSize <= minFontSize) break;
    fontSize = Math.round(fontSize * 0.94);
  }

  const lineH = fontSize * lineHFactor;
  const areaCenter = (quoteAreaTop + quoteAreaBottom) / 2;
  const groupH = (lines.length - 1) * lineH + fontSize * 4.45;
  const groupTop = areaCenter - groupH / 2;
  const startY = groupTop + fontSize * 2.55; // خط أساس السطر الأول

  /* القوسان الذهبيان اللامعان — العلوي » قبل النص والسفلي « بعده بمسافة جمالية (my-4) */
  const goldGrad = ctx.createLinearGradient(0, quoteAreaTop, 0, quoteAreaBottom);
  goldGrad.addColorStop(0, "#F5D78E");
  goldGrad.addColorStop(0.5, "#D9A441");
  goldGrad.addColorStop(1, "#C08A16");
  const topMark = variant === "quran" ? "﴾" : "»";
  const bottomMark = variant === "quran" ? "﴿" : "«";
  const markFont = (scale: number) => {
    ctx.font =
      variant === "quran"
        ? `400 ${Math.round(fontSize * scale)}px "Amiri Quran", "Amiri", serif`
        : `700 ${Math.round(fontSize * scale)}px "Amiri", serif`;
  };
  ctx.textAlign = "center";
  ctx.fillStyle = goldGrad;
  ctx.globalAlpha = 0.95;
  markFont(1.55);
  /* الرسم بإشارة ltr صريحة: direction=rtl العامة للبطاقة تعكس الشكل المرئي للقوسين
     في بعض المتصفحات — نثبّت الشكل المرئي المطلوب حرفيًا: أعلى » وأسفل « */
  ctx.save();
  ctx.direction = "ltr";
  ctx.fillText(topMark, W / 2, groupTop + fontSize * 1.15);
  ctx.restore();
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
    ctx.fillText(line, W / 2, startY + i * lineH);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = goldGrad;
  markFont(1.55);
  ctx.save();
  ctx.direction = "ltr"; // ثبات الشكل المرئي: « كسفلي مهما اختلف اتجاه البطاقة
  ctx.fillText(bottomMark, W / 2, startY + (lines.length - 1) * lineH + fontSize * 1.55);
  ctx.restore();

  /* ============ ٦) الفوتر — فاصل ذهبي كامل + كتلة نص يمين + بلاطة QR يسار ============ */
  /* الفاصل الذهبي الكامل — border-t border-amber-500/20 */
  ctx.fillStyle = "rgba(245,158,11,0.22)";
  ctx.fillRect(m + pad, sepY, W - (m + pad) * 2, 2);

  /* كتلة النص الثلاثية — محاذاة يمين كاملة بأسطر متباعدة بمقاسات صريحة */
  ctx.textAlign = "right";

  /* سطر ١: عنوان المقال — ذهبي هادئ (text-xs text-amber-200/80 font-medium) */
  if (articleTitle.trim() && footerMaxW > 180) {
    ctx.fillStyle = "rgba(253,230,138,0.82)";
    ctx.font = `500 ${titleSize}px "Readex Pro", "Amiri", sans-serif`;
    let title = articleTitle.trim();
    while (ctx.measureText(title).width > footerMaxW && title.length > 6) {
      title = title.slice(0, -3);
    }
    if (title !== articleTitle.trim()) title += "…";
    ctx.fillText(title, textRight, titleBaseline);
  }

  /* سطر ٢: اسم المنصة — أبيض بارز وواضح (text-base font-bold text-white) */
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${brandSize}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("كلام له لازمة", textRight, brandBaseline);

  /* سطر ٣: اللسان المميز — رمادي مريح (text-[10px] text-zinc-400) بفاصل صريح يمنع الالتصاق */
  ctx.fillStyle = "rgba(161,161,170,0.95)";
  ctx.font = `400 ${taglineSize}px "Readex Pro", "Amiri", sans-serif`;
  ctx.fillText("مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.", textRight, taglineBaseline);

  /* بلاطة QR — يسار الفوتر، وتحتها مباشرة «امسح للقراءة» بمسافة آمنة (mt-1.5) */
  if (qr) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, tileX, tileTop, tile, tile, Math.round(tile * 0.12));
    ctx.fill();
    ctx.restore();
    const inset = Math.round((tile - qrSize) / 2);
    ctx.drawImage(qr, tileX + inset, tileTop + inset, qrSize, qrSize);
    ctx.fillStyle = "rgba(161,161,170,0.9)"; // text-[9px] text-zinc-400
    ctx.font = `500 ${captionSize}px "Readex Pro", "Amiri", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("امسح للقراءة", captionCx, captionBaseline);
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
  /* حالات التغذية الراجعة التنفيذية — المؤشر الملموس أن الإجراء يعمل */
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  /* تلميح التحديد الطويل — يظهر فوريًا على الشريحة وعند نقر زر الشريط */
  const [selectionHint, setSelectionHint] = useState("");
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* نافذة البديل الذكي: رسالة خطأ داخلية عند تجاوز اقتراح/إدخال للسقف */
  const [pickerHint, setPickerHint] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const chipGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback((msg: string) => {
    setSelectionHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSelectionHint(""), 2800);
  }, []);

  useEffect(() => setMounted(true), []);

  /* حالة التحديد الحالي بالنسبة للسقف — مرجع موحد للشريحة والزر */
  const selectedWords = countWords(selectedText.trim());
  const selectionOverLimit =
    selectedText.trim().length >= MIN_QUOTE_CHARS && selectedWords > MAX_QUOTE_WORDS;

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
      if (text.length < MIN_QUOTE_CHARS || text.length > 5000) {
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

  /* نسخ التحديد مع المصدر — «…النص… — منصة كلام له لازمة» + رابط المقال */
  const [copied, setCopied] = useState(false);
  const copySelection = useCallback(async () => {
    const text = stripMarkdown(selectedText);
    const payload = `${text}\n— منصة كلام له لازمة\n${window.location.origin}/article/${articleSlug}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      trackShareBySlug(articleSlug, "copy-source", selectedText.length);
    } catch {}
  }, [selectedText, articleSlug]);

  /* مشاركة مباشرة عبر مشاركة النظام مع سقوط آمن إلى النسخ */
  const shareSelection = useCallback(async () => {
    const text = stripMarkdown(selectedText);
    const url = `${window.location.origin}/article/${articleSlug}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: articleTitle, text: `${text}\n— منصة كلام له لازمة`, url });
        trackShareBySlug(articleSlug, "web-share-selection", selectedText.length);
      } else {
        await navigator.clipboard.writeText(`${text}\n— منصة كلام له لازمة\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        trackShareBySlug(articleSlug, "copy-source", selectedText.length);
      }
    } catch {}
  }, [selectedText, articleSlug, articleTitle]);

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

  /** التحميل بتغذية راجعة كاملة — مؤشر دوران + تعطيل مزدوج حتى اكتمال التصدير */
  const handleDownload = useCallback(async () => {
    if (isExporting || isSharing) return;
    try {
      setIsExporting(true);
      /* إتاحة إطار للرسم قبل العمل الثقيل على الخيط الرئيسي —
         كي يلمس القارئ المؤشر فعلًا قبل بدء التصدير */
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const canvas = canvasRef.current;
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `quote-kalam-${articleSlug}-${size.key}.png`;
      a.click();
      trackShareBySlug(articleSlug, "quote-download", selectedText.length);
      void trackImpact();
    } finally {
      setIsExporting(false);
    }
  }, [articleSlug, isExporting, isSharing, selectedText.length, size.key, trackImpact]);

  const shareNative = useCallback(async () => {
    if (isSharing || isExporting) return;
    try {
      setIsSharing(true);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
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
        } catch {
          /* المستخدم ألغى المشاركة — نسقط إلى النسخ */
        }
      }
      // fallback: نسخ النص
      try {
        await navigator.clipboard.writeText(`«${selectedText}» — كلام له لازمة`);
        alert("تم نسخ الاقتباس.. الصقه حيث تريد.");
      } catch {}
    } finally {
      setIsSharing(false);
    }
  }, [articleSlug, articleTitle, isExporting, isSharing, selectedText, trackImpact]);

  /**
   * تصفير الكانفاس والحالات عند الإغلاق — لا تسرب شفافية ولا تراكم طبقات
   * عند إعادة الفتح، ولا زر عالق في حالة تحميل قديمة.
   */
  useEffect(() => {
    if (open) return;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setIsExporting(false);
    setIsSharing(false);
  }, [open]);

  /**
   * فتح المولد — التوجيه الواعي بدل الاقتراحات القسرية:
   *  - تحديد سليم ضمن السقف → البطاقة فورًا.
   *  - تحديد طويل → الزر يبقى غير نشط مع تلميح فوري يُرشد لتقليص التحديد،
   *    ولا تُفتح نافذة الاقتراحات رغمًا عن القارئ أبدًا.
   *  - لا تحديد → نافذة البديل الذكي (إرادة صريحة من القارئ).
   */
  const requestOpen = useCallback(() => {
    const text = selectedText.trim();
    const overLimit = text.length >= MIN_QUOTE_CHARS && countWords(text) > MAX_QUOTE_WORDS;
    if (overLimit) {
      showHint(`النص طويل.. اختر عبارة مركزة (الحد الأقصى ${MAX_QUOTE_WORDS} كلمة)`);
      return;
    }
    if (text.length >= MIN_QUOTE_CHARS) {
      setOpen(true);
    } else {
      setPickerHint("");
      setManualQuote("");
      setPickerOpen(true);
    }
  }, [selectedText, showHint]);

  const adoptQuote = useCallback((text: string) => {
    const clean = text.trim().replace(/\s+/g, " ");
    if (clean.length < MIN_QUOTE_CHARS) return;
    if (countWords(clean) > MAX_QUOTE_WORDS) {
      setPickerHint(`هذه العبارة تتجاوز سعة البطاقة — اختر عبارة مركزة (الحد الأقصى ${MAX_QUOTE_WORDS} كلمة)`);
      return;
    }
    setPickerHint("");
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

      {/* الشريحة العائمة عند التحديد — زر البطاقة يبقى مرئيًا معطلًا مع
          تلميح فوري عند تجاوز السقف، بلا تحويل قسري للاقتراحات */}
      {chipPos && mounted && !open && (
        <div
          ref={chipRef}
          className="quote-chip no-print fixed z-50 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 rounded-2xl border p-1 shadow-lift"
          style={{ left: chipPos.x, top: chipPos.y, background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-1">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onTouchEnd={(e) => {
                e.preventDefault();
                if (selectionOverLimit) return;
                requestOpen();
              }}
              onClick={() => {
                if (!selectionOverLimit) requestOpen();
              }}
              disabled={selectionOverLimit}
              aria-disabled={selectionOverLimit}
              title={selectionOverLimit ? `النص طويل.. اختر عبارة مركزة (الحد الأقصى ${MAX_QUOTE_WORDS} كلمة)` : "حوّل التحديد إلى بطاقة مشاركة"}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-all ${
                selectionOverLimit ? "cursor-not-allowed opacity-45" : "hover:scale-105"
              }`}
              style={selectionOverLimit ? { background: "var(--border)", color: "var(--ink-muted)" } : { background: "var(--accent)", color: "#fff" }}
            >
              {selectionOverLimit ? `النص طويل (${selectedWords}/${MAX_QUOTE_WORDS} كلمة)` : "اقتباس كبطاقة"}
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onTouchEnd={(e) => {
                e.preventDefault();
                copySelection();
              }}
              onClick={copySelection}
              className="whitespace-nowrap rounded-full px-3 py-2 text-xs transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: copied ? "var(--accent-strong)" : "var(--ink)" }}
            >
              {copied ? "نُسخ ✓" : "نسخ مع المصدر"}
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onTouchEnd={(e) => {
                e.preventDefault();
                shareSelection();
              }}
              onClick={shareSelection}
              className="whitespace-nowrap rounded-full px-3 py-2 text-xs transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
            >
              مشاركة
            </button>
          </div>
          {selectionOverLimit && (
            <p className="max-w-[260px] px-2 pb-1 text-center text-[10px] font-semibold leading-4" style={{ color: "var(--ink-muted)" }}>
              اختر عبارة مركزة — الحد الأقصى {MAX_QUOTE_WORDS} كلمة (حدّد من جديد لتقليص التحديد)
            </p>
          )}
        </div>
      )}

      {/* تلميح عائم مؤقت — يظهر عند نقر «اقتباسها» بتحديد طويل */}
      {selectionHint && mounted && createPortal(
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 animate-fade-in"
        >
          <p
            className="max-w-sm rounded-2xl border px-4 py-3 text-center text-xs font-bold leading-6 shadow-lift"
            style={{ background: "var(--surface)", borderColor: "var(--accent)", color: "var(--accent-strong)" }}
          >
            {selectionHint}
          </p>
        </div>,
        document.body,
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

              {/* المقاسات — أبعاد تصدير ثابتة برمجيًا بجودة متطابقة من أي جهاز */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  onClick={handleDownload}
                  disabled={isExporting || isSharing || rendering}
                  className={`rounded-xl px-4 py-3 text-sm font-bold shadow-soft transition-all duration-200 ${
                    isExporting || isSharing || rendering
                      ? "cursor-not-allowed scale-[0.98] opacity-60"
                      : "hover:scale-[1.02]"
                  }`}
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {isExporting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      جارٍ تجهيز البطاقة...
                    </span>
                  ) : (
                    "تحميل الصورة"
                  )}
                </button>
                <button
                  onClick={shareNative}
                  disabled={isSharing || isExporting || rendering}
                  className={`rounded-xl border px-4 py-3 text-sm font-bold transition-all duration-200 ${
                    isSharing || isExporting || rendering
                      ? "cursor-not-allowed scale-[0.98] opacity-60"
                      : "hover:scale-[1.02]"
                  }`}
                  style={{ color: "var(--accent-strong)", borderColor: "var(--accent)" }}
                >
                  {isSharing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      جارٍ المشاركة...
                    </span>
                  ) : (
                    "مشاركة"
                  )}
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

              {/* رسالة السقف — لما يتجاوز اقتراح أو إدخال يدوي 25 كلمة */}
              {pickerHint && (
                <p
                  className="mb-3 rounded-xl border px-3 py-2 text-center text-[11px] font-bold leading-5"
                  style={{ borderColor: "var(--accent)", color: "var(--accent-strong)", background: "var(--accent-soft)" }}
                  role="alert"
                >
                  {pickerHint}
                </p>
              )}

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
