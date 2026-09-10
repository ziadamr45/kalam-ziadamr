import path from "path";

/**
 * ============================================================
 * حاقن جداول الخطوط — إكمال subsets محرك fontkit/pdfkit الناقصة
 * ============================================================
 * المشكلة الجذرية الموثقة بصرياً: fontkit يبني subsets بلا جداول
 * (cmap / OS/2 / post / name) رغم تعليقه الصريح في مصدره أنها
 * «مطلوبة للخطوط المستقلة». العوارض الملتزمة بالمواصفات (Adobe /
 * Chrome / MuPDF) ترسم بالـ CID↔GID مباشرة فتظهر سليمة، بينما
 * عوارض كثيرة على الهواتف (iOS QuickLook وبعض عوارض أندرويد)
 * تعتمد جزئياً على cmap/OS-2 فتُسقط حروفاً وأرقاماً عشوائية —
 * «سخرية» تظهر «خرية» و«صفحة ١ من ٥» تظهر «صفحة ١ من .».
 *
 * الحل: رقعة على fontkit.TTFFont.prototype.createSubset تعيد
 * بناء خط الـ subset بعد encode ليشمل:
 *  - cmap صيغة 4 كاملة (كل نقاط اليونيكود المستخدمة ← GID الجديد)
 *  - OS/2 نسخة 0 بالمقاييس الحقيقية من hhea/head
 *  - post نسخة 3.0 (32 بايت قياسية)
 *  - name بأسماء العائلة الأساسية (منصة 3/1)
 * مع إعادة حساب المجموع الاختباري checkSumAdjustment.
 *
 * الفشل آمن بالتصميم: أي استثناء يُعيد الخط الأصلي كما هو.
 */

/* ================= أدوات ثنائية مساعدة ================= */

function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v & 0xffff, 0);
  return b;
}
function s16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeInt16BE(Math.max(-32768, Math.min(32767, v)), 0);
  return b;
}
function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v >>> 0, 0);
  return b;
}
function pad4(buf: Buffer): Buffer {
  const r = buf.length % 4;
  return r ? Buffer.concat([buf, Buffer.alloc(4 - r)]) : buf;
}
function tableChecksum(buf: Buffer): number {
  const p = pad4(buf);
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum = (sum + p.readUInt32BE(i)) >>> 0;
  return sum >>> 0;
}
function pow2Floor(v: number): number {
  let p = 1;
  while (p * 2 <= v) p *= 2;
  return p;
}

/** قراءة مقاييس hhea و macStyle من خط الـ subset المولَّد */
function readMetrics(base: Buffer): { ascent: number; descent: number; lineGap: number; bold: boolean } {
  try {
    const n = base.readUInt16BE(4);
    let ascent = 800, descent = -200, lineGap = 0, bold = false;
    for (let i = 0; i < n; i++) {
      const rec = 12 + i * 16;
      const t = base.toString("ascii", rec, rec + 4);
      const off = base.readUInt32BE(rec + 8);
      if (t === "hhea") {
        ascent = base.readInt16BE(off + 4);
        descent = base.readInt16BE(off + 6);
        lineGap = base.readInt16BE(off + 8);
      } else if (t === "head") {
        bold = (base.readUInt16BE(off + 44) & 1) === 1;
      }
    }
    return { ascent, descent, lineGap, bold };
  } catch {
    return { ascent: 800, descent: -200, lineGap: 0, bold: false };
  }
}

/* ================= cmap صيغة 4 ================= */

/** بناء جدول cmap (3,1) format 4 من خريطة نقطة يونيكود ← GID جديد.
 *  المقاطع غير الخطية تستعمل glyphIdArray الصريحة — صحيحة دائمًا. */
function buildCmapSubtable4(codeToGid: Map<number, number>): Buffer {
  const codes = [...codeToGid.keys()].filter((c) => c > 0 && c <= 0xffff).sort((a, b) => a - b);

  type Seg = { start: number; end: number; gids: number[] };
  const segs: Seg[] = [];
  for (const c of codes) {
    const last = segs[segs.length - 1];
    const gid = codeToGid.get(c)!;
    if (last && last.end === c - 1 && last.end - last.start < 500) {
      last.end = c;
      last.gids.push(gid);
    } else {
      segs.push({ start: c, end: c, gids: [gid] });
    }
  }
  /* القطعة الحارسة 0xFFFF — idDelta=1 يجعل 0xFFFF يُمرَّر إلى GID 0 (.notdef) */
  segs.push({ start: 0xffff, end: 0xffff, gids: [] });

  const segCount = segs.length;
  const realGids = segs.slice(0, -1).flatMap((s) => s.gids);
  const length = 14 + segCount * 8 + 2 + realGids.length * 2;

  const parts: Buffer[] = [];
  parts.push(u16(4)); // format
  parts.push(u16(length));
  parts.push(u16(0)); // language
  parts.push(u16(segCount * 2)); // segCountX2
  const sr = pow2Floor(segCount) * 2;
  const es = Math.round(Math.log2(sr / 2));
  parts.push(u16(sr)); // searchRange
  parts.push(u16(es)); // entrySelector
  parts.push(u16(segCount * 2 - sr)); // rangeShift

  for (const s of segs) parts.push(u16(s.end)); // endCode[]
  parts.push(u16(0)); // reservedPad
  for (const s of segs) parts.push(u16(s.start)); // startCode[]
  for (let i = 0; i < segCount; i++) parts.push(u16(i === segCount - 1 ? 1 : 0)); // idDelta[]
  /* idRangeOffset: المسافة بالبايت من موقع القيد نفسه إلى بداية
     مقطع الـ GIDs الخاص به داخل glyphIdArray =
     2*(segCount - i + مجموع gids القطع السابقة) */
  let gidsBefore = 0;
  for (let i = 0; i < segCount; i++) {
    if (i === segCount - 1) parts.push(u16(0));
    else parts.push(u16(2 * (segCount - i + gidsBefore)));
    gidsBefore += segs[i].gids.length;
  }
  for (const g of realGids) parts.push(u16(g));

  return Buffer.concat(parts);
}

function buildCmapTable(codeToGid: Map<number, number>): Buffer {
  const sub = buildCmapSubtable4(codeToGid);
  return Buffer.concat([
    u16(0), // version
    u16(1), // numTables
    u16(3), u16(1), // platformID 3 / encodingID 1 (Windows Unicode BMP)
    u32(12), // offset
    sub,
  ]);
}

/* ================= post وOS/2 وname ================= */

function buildPostTable(): Buffer {
  return Buffer.concat([
    u32(0x00030000), // version 3.0 — بلا أسماء رموز
    u32(0), // italicAngle
    s16(-150), // underlinePosition
    s16(50), // underlineThickness
    u32(0), // isFixedPitch
    u32(0), u32(0), u32(0), u32(0), // حدود الذاكرة
  ]);
}

function buildOS2Table(m: { ascent: number; descent: number; lineGap: number; bold: boolean }, codes: number[]): Buffer {
  const first = Math.min(0xffff, codes.length ? Math.min(...codes) : 0x20);
  const last = Math.min(0xffff, codes.length ? Math.max(...codes) : 0xfffd);
  const parts: Buffer[] = [];
  parts.push(u16(0)); // version 0
  parts.push(s16(500)); // xAvgCharWidth
  parts.push(u16(m.bold ? 700 : 400)); // usWeightClass
  parts.push(u16(5)); // usWidthClass
  parts.push(u16(0)); // fsType — تثبيت مسموح
  /* الرموز السفلية/العلوية/الشطب */
  parts.push(s16(650), s16(600), s16(0), s16(75));
  parts.push(s16(650), s16(600), s16(0), s16(350));
  parts.push(s16(50), s16(300));
  parts.push(s16(0)); // sFamilyClass
  parts.push(Buffer.alloc(10)); // PANOSE
  parts.push(u32(0), u32(0), u32(0), u32(0)); // unicodeRange
  parts.push(Buffer.from("KLMZ", "ascii")); // achVendID
  parts.push(u16(m.bold ? 0x20 : 0x40)); // fsSelection BOLD/REGULAR
  parts.push(u16(first), u16(last));
  parts.push(s16(m.ascent), s16(m.descent), s16(m.lineGap));
  parts.push(u16(m.ascent), u16(Math.abs(m.descent)));
  return Buffer.concat(parts);
}

function buildNameTable(psName: string): Buffer {
  const family = psName.replace(/[-_].*$/, "") || "Kalam";
  const subfamily = /bold/i.test(psName) ? "Bold" : "Regular";
  const full = `${family} ${subfamily}`;
  const strings: Array<[number, string]> = [
    [1, family],
    [2, subfamily],
    [4, full],
    [6, psName.replace(/[^A-Za-z0-9-]/g, "") || "KalamFont"],
  ];
  const encoded = strings.map(([, s]) => Buffer.from(s, "utf16le").swap16()); // UTF-16BE
  const count = strings.length;
  const nameRecords = Buffer.concat(
    strings.map(([id], i) =>
      Buffer.concat([
        u16(3), u16(1), u16(0x0409), u16(id),
        u16(encoded[i].length),
        u16(encoded.slice(0, i).reduce((a, b) => a + b.length, 0)),
      ]),
    ),
  );
  return Buffer.concat([
    u16(0), // format
    u16(count),
    u16(6 + count * 12), // stringOffset
    nameRecords,
    ...encoded,
  ]);
}

/* ================= إعادة بناء ملف الخط ================= */

function rebuildFont(base: Buffer, extras: Array<[string, Buffer]>): Buffer {
  const numTables = base.readUInt16BE(4);
  const merged = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const t = base.toString("ascii", rec, rec + 4);
    const off = base.readUInt32BE(rec + 8);
    const len = base.readUInt32BE(rec + 12);
    merged.set(t, Buffer.from(base.subarray(off, off + len)));
  }
  for (const [t, d] of extras) merged.set(t, d);

  const entries = [...merged.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const n = entries.length;
  const es = Math.floor(Math.log2(n));
  const sr = 2 ** es * 16;

  let offset = 12 + n * 16;
  const laid = entries.map(([t, d]) => {
    const e = { tag: t, data: d, offset, padded: pad4(d) };
    offset += e.padded.length;
    return e;
  });

  const out = Buffer.alloc(offset);
  out.writeUInt32BE(0x00010000, 0); // sfnt version TrueType
  out.writeUInt16BE(n, 4);
  out.writeUInt16BE(sr, 6);
  out.writeUInt16BE(es, 8);
  out.writeUInt16BE(n * 16 - sr, 10);
  laid.forEach((e, i) => {
    const rec = 12 + i * 16;
    out.write(e.tag, rec, "ascii");
    out.writeUInt32BE(tableChecksum(e.data), rec + 4);
    out.writeUInt32BE(e.offset, rec + 8);
    out.writeUInt32BE(e.data.length, rec + 12);
    e.padded.copy(out, e.offset);
  });

  /* head.checkSumAdjustment — يُصفَّر ثم يُحسب للملف كاملًا */
  const head = laid.find((e) => e.tag === "head");
  if (head) {
    out.writeUInt32BE(0, head.offset + 8);
    const sum = tableChecksum(out);
    out.writeUInt32BE((0xb1b0afba - sum) >>> 0, head.offset + 8);
  }
  return out;
}

/* ================= التثبيت (مرة واحدة لكل عملية) ================= */

import { createRequire } from "node:module";

let installPromise: Promise<void> | null = null;

/**
 * تركعقة createSubset بحيث يخرج الخط المضمَّن كاملاً الجداول.
 * يجب انتظارها قبل أول توليد — آمنة للاستدعاء المتكرر (تُنفَّذ مرة).
 *
 * ⚠️ خطر الحزمة المزدوجة الموثق: @react-pdf/renderer يُحمَّل كـ ESM
 * فيستورد fontkit عبر dist/module.mjs، بينما require('fontkit')
 * يفتح dist/main.cjs — صنفان مختلفان تمامًا (prototype غير مشترك).
 * لذا تُرقَّع النسختان معًا، والنسخة ESM هي الحاسمة لأن pdfkit
 * يستدعي createSubset على كائنات الخطوط القادمة منها.
 */
export function installPdfFontEnhancer(): Promise<void> {
  if (!installPromise) installPromise = doInstall();
  return installPromise;
}

async function doInstall(): Promise<void> {
  try {
    /* النسخة CJS — تُرقَّع احتياطًا إن كان أي مسار يستعملها */
    patchFontkitModule(() => {
      const req = createRequire(__filename);
      return req("fontkit");
    }, "cjs");

    try {
      /* استيراد ESM ديناميكي — webpack يُصدره كاستيراد أصلي لخارجية
         serverExternalPackages فيعيد نفس نسخة الوحدة التي يفتحها
         react-pdf (سجل وحدات ESM المشترك)، على عكس require(esm) الذي
         يفشل تفسير أسماءه داخل حزم Next (موثق: "(void 0) is not a
         function" في restructure/swc-helpers) */
      const esm = await import("fontkit");
      patchFontkitModule(() => esm, "esm");
    } catch (e) {
      console.error(
        "[pdf-font-tables:esm] install failed:",
        e instanceof Error ? `${e.message}\nstack=${e.stack ?? "(none)"}` : e,
      );
      /* بيئة بلا دعم — تبقى رقعة CJS وحدها */
    }
  } catch {
    /* بيئة بلا fontkit — نترك السلوك الافتراضي */
  }
}

function patchFontkitModule(getModule: () => any, label: string): void {
  const mod = getModule();
  if (!mod || typeof mod.openSync !== "function") {
    console.error(`[pdf-font-tables:${label}] module unavailable`);
    return;
  }
  const samplePath = path.join(process.cwd(), "src", "assets", "fonts", "Tajawal-Regular.ttf");
  const sample = mod.openSync(samplePath);
  const proto: any = Object.getPrototypeOf(sample);
  if (!proto || typeof proto.createSubset !== "function" || proto.__kalamFontEnhanced) {
    console.error(`[pdf-font-tables:${label}] skip — already patched or no createSubset`);
    return;
  }

  const origCreate = proto.createSubset;
  proto.createSubset = function (this: any, ...args: unknown[]) {
    const subset = origCreate.apply(this, args);
    if (!subset || subset.__kalamEnhanced) return subset;
    const origEncode = subset.encode.bind(subset);
    subset.encode = () => {
      const base: Uint8Array = origEncode();
      try {
        const enhanced = enhanceSubsetBuffer(base, subset);
        console.error(`[pdf-font-tables:${label}] enhanced font ${base.length}B -> ${enhanced.length}B`);
        return enhanced;
      } catch (e) {
        console.error(`[pdf-font-tables:${label}] enhance failed:`, e instanceof Error ? e.message : e);
        return base; /* الفشل آمن — الخط الأصلي كما هو */
      }
    };
    subset.__kalamEnhanced = true;
    return subset;
  };
  proto.__kalamFontEnhanced = true;
  console.error(`[pdf-font-tables:${label}] patch installed`);
}

function enhanceSubsetBuffer(rawBase: Uint8Array, subset: any): Buffer {
  /* نسخة ESM من fontkit تُعيد Uint8Array صرفة — نحوّلها عرضًا صفري النسخ */
  const base = Buffer.isBuffer(rawBase)
    ? rawBase
    : Buffer.from(rawBase.buffer, rawBase.byteOffset, rawBase.byteLength);

  const font = subset?.font;
  /* ⚠️ أشكال موثقة في نسخة ESM:
     - subset.glyphs = مصفوفة أرقام (GIDs أصلية) — الفهرس نفسه هو
       GID subset الجديد، و glyphs[0] = 0 (.notdef يُسبق تلقائيًا).
     - جداول cmap الفرعية بلا codeMap موثوقة (Amiri كلها undefined)
       — الرابط العالمي الموثوق هو getGlyph(gid).codePoints لأن كاش
       layout يحفظ نسخ Glyph المحمّلة بنقاطها الأصلية، ونسختها
       الاحتياطية stringsForGlyph (تشمل صيغ العرض). */
  const glyphIds: number[] = Array.isArray(subset?.glyphs) ? subset.glyphs.map(Number) : [];
  if (glyphIds.length <= 1) return base;

  const codeToNew = new Map<number, number>();
  for (let i = 0; i < glyphIds.length; i++) {
    const gid = glyphIds[i];
    if (!gid) continue; /* .notdef */
    let cps: number[] | undefined;
    try {
      cps = font?.getGlyph?.(gid)?.codePoints;
    } catch {
      /* يتبع stringsForGlyph */
    }
    if (!cps?.length) {
      try {
        const strings = font?.stringsForGlyph?.(gid) ?? [];
        cps = strings.flatMap((s: string) => [...s].map((ch) => ch.codePointAt(0)!)).filter(Boolean);
      } catch {
        /* رمز غير مرتبط بأي حرف — يُترك بلا قيد cmap (سلوك مطابق للمواصفة) */
      }
    }
    if (!cps?.length) continue;
    for (const cp of cps) {
      if (cp > 0 && cp <= 0xffff && !codeToNew.has(cp)) codeToNew.set(cp, i);
    }
  }
  if (codeToNew.size === 0) {
    console.error("[pdf-font-tables] empty mapping — لا حروف مرتبطة في هذا الخط");
    return base;
  }

  const metrics = readMetrics(base);
  const psName: string = font?.postscriptName || "KalamFont";
  const extras: Array<[string, Buffer]> = [
    ["cmap", buildCmapTable(codeToNew)],
    ["post", buildPostTable()],
    ["OS/2", buildOS2Table(metrics, [...codeToNew.keys()])],
    ["name", buildNameTable(psName)],
  ];
  return rebuildFont(base, extras);
}

