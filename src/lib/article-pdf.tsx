import path from "path";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import { parseBlocks, parseInline, type Block } from "@/lib/content-blocks";
import { formatArabicDate } from "@/lib/utils";

/**
 * ============================================================
 * محرك التصدير التحريري — PDF احترافي صالح للطباعة (Print-Ready)
 * ============================================================
 * قالب وثيقة رسمي لمقالات «منصة كلام له لازمة»:
 *  - ترويسة رسمية: شعار المنصة + التصنيف + تاريخ النشر + الكاتب
 *    + خط فاصل ذهبي، مع رمز QR يوجه للنسخة التفاعلية الصوتية.
 *  - غلاف بأبعاد متناسقة لا تستحوذ على الصفحة، وعنوان بخط أميري فخم.
 *  - تذييل ثابت أسفل كل صفحة: اليمين هوية المنصة، المنتصف رابط
 *    المقال المقروء، اليسار رقم الصفحة تلقائيًا (صفحة ١ من ٣).
 *  - صفحة A4 بهوامش مكتبية، وخط أميري للمتن (12.5pt بسطر 1.8).
 * نفس المنظومة المثبتة في التقرير الرقابي بالريبو الإداري.
 */

const FONTS_DIR = path.join(process.cwd(), "src", "assets", "fonts");

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Tajawal",
    fonts: [
      { src: path.join(FONTS_DIR, "Tajawal-Regular.ttf") },
      { src: path.join(FONTS_DIR, "Tajawal-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Amiri",
    fonts: [
      { src: path.join(FONTS_DIR, "Amiri-Regular.ttf") },
      { src: path.join(FONTS_DIR, "Amiri-Bold.ttf"), fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

/* ==================== اللوحة اللونية الطباعية ==================== */

const INK = "#1A1A1A"; // السواد الطباعي
const GOLD = "#B45309"; // الذهبي الرسمي
const DARK = "#1E293B"; // كحلي الترويسة
const STEEL = "#64748B"; // رمادي البيانات
const OLIVE = "#4D7C0F"; // الآيات
const FAINT = "#E7E5E4"; // خطوط فاصلة خفيفة

/** الأرقام الشرقية للترقيم الطباعي */
function eastern(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * الرابط كما يُطبع في التذييل — عربي مقروء كاملًا دون قص:
 *  1) فك ترميز الـ slug العربي (%D9%85...) إلى حروفه الأصلية.
 *  2) سقف أمان بعيد فقط (120 حرفًا) للأسماء المرضية الاستثنائية —
 *     الرابط العادي يظهر كاملًا، والتوازي يتم عبر السطرين داخل خلية
 *     مرنة منفصلة تمامًا عن رقم الصفحة (كسر الأسطر عند الشرطات سليم).
 */
function printableUrl(url: string): string {
  let clean = url;
  try {
    clean = decodeURIComponent(url);
  } catch {
    /* تسلسلات ترميز ناقصة — نُبقي الرابط كما ورد بدل الانهيار */
  }
  clean = clean.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean;
}

export type ArticlePdfInput = {
  title: string;
  summary: string | null;
  content: string; // المتن المجرد — مصدر الطباعة النقي
  coverImage: string | null; // data URI جاهز (JPEG) أو null
  coverRatio: number | null; // العرض÷الارتفاع الحقيقي للغلاف — لاحتواء كامل بلا قص
  qrDataUrl: string | null; // رمز QR لرابط المقال الحي
  sectionName: string | null;
  publishedAt: Date | null;
  authorName: string;
  articleUrl: string; // الرابط المقروء للتذييل
};

/* ==================== عناصر المتن ==================== */

/** مقاطع السطر المضمّن — غامق/مائل/مشطوب/شيفرة */
function Inline({ raw }: { raw: string }) {
  const segs = parseInline(raw);
  return (
    <>
      {segs.map((s, i) => {
        switch (s.t) {
          case "b":
            return <Text key={i} style={{ fontWeight: 700, color: INK }}>{s.x}</Text>;
          case "i":
            return <Text key={i} style={{ fontFamily: "Tajawal" }}>{s.x}</Text>;
          case "s":
            return <Text key={i} style={{ textDecoration: "line-through" }}>{s.x}</Text>;
          case "c":
            return (
              <Text key={i} style={{ fontFamily: "Tajawal", fontSize: 9.5, backgroundColor: "#F4F4F5" }}>
                {s.x}
              </Text>
            );
          default:
            return <Text key={i}>{s.x}</Text>;
        }
      })}
    </>
  );
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return (
        <Text style={styles.p}>
          <Inline raw={block.text} />
        </Text>
      );
    case "h2":
      return (
        <View style={styles.h2Box} wrap={false}>
          <Text style={styles.h2}>{block.text}</Text>
        </View>
      );
    case "h3":
      return (
        <View style={styles.h3Box} wrap={false}>
          <Text style={styles.h3}>{block.text}</Text>
        </View>
      );
    case "quote":
      return (
        <View style={styles.quoteBox} wrap={false}>
          <Text style={styles.quoteText}>
            <Inline raw={block.text} />
          </Text>
        </View>
      );
    case "list":
      return (
        <View style={styles.listBox} wrap={false}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.listRow} wrap={false}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>
                <Inline raw={it} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "olist":
      return (
        <View style={styles.listBox} wrap={false}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.listRow} wrap={false}>
              <Text style={styles.bullet}>{eastern((block.start ?? 1) + i)}.</Text>
              <Text style={styles.listText}>
                <Inline raw={it} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "hr":
      return <View style={styles.hr} wrap={false} />;
    case "quran":
      return (
        <View style={styles.quranBox} wrap={false}>
          <Text style={styles.quranText}>﴿ {block.text} ﴾</Text>
          <Text style={styles.quranRef}>سورة {block.sura} — الآية {block.ayah}</Text>
        </View>
      );
    case "hadith":
      return (
        <View style={styles.hadithBox} wrap={false}>
          <Text style={styles.hadithText}>{block.text}</Text>
          <Text style={styles.hadithRef}>رواه {block.narrator}</Text>
        </View>
      );
    case "note":
      return (
        <View style={styles.noteBox} wrap={false}>
          <Text style={styles.noteLabel}>ملاحظة</Text>
          <Text style={styles.noteText}>
            <Inline raw={block.text} />
          </Text>
        </View>
      );
    case "question":
      return (
        <View style={styles.questionBox} wrap={false}>
          <Text style={styles.questionLabel}>سؤال للنقاش</Text>
          <Text style={styles.questionText}>
            <Inline raw={block.text} />
          </Text>
        </View>
      );
    case "table":
      return (
        <View style={styles.tableBox} wrap={false}>
          {block.head.length > 0 && (
            <View style={[styles.tableRow, styles.tableHeadRow]} wrap={false}>
              {block.head.map((h, i) => (
                <Text key={i} style={[styles.tableCell, styles.tableHeadCell]}>
                  {h}
                </Text>
              ))}
            </View>
          )}
          {block.rows.map((row, r) => (
            <View key={r} style={styles.tableRow} wrap={false}>
              {row.map((cell, c) => (
                <Text key={c} style={styles.tableCell}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

/* ==================== الوثيقة التحريرية ==================== */

function ArticlePdf(input: ArticlePdfInput) {
  const blocks = parseBlocks(input.content);
  const metaParts = [
    input.sectionName,
    input.publishedAt ? formatArabicDate(input.publishedAt) : null,
    input.authorName,
  ].filter(Boolean) as string[];

  return (
    <Document
      title={input.title}
      author={input.authorName}
      subject="منصة كلام له لازمة — فكر بلا ضجيج"
      language="ar"
    >
      <Page size="A4" style={styles.page}>
        {/* ===== التذييل الثابت — أسفل كل صفحة مطبوعة =====
             ثلاث خلايا منفصلة تمامًا: هوية المنصة (يمين) — الرابط
             المقروء المرن (وسط) — رقم الصفحة (يسار)؛ الخلية الوسطى
             flex:1 بحدّ أقصى مضبوط فلا تفيض أبدًا على الجارين */}
        <View style={styles.footer} fixed>
          <Text style={styles.footRight}>منصة كلام له لازمة — فكر بلا ضجيج</Text>
          <Text style={styles.footCenter}>{printableUrl(input.articleUrl)}</Text>
          <Text
            style={styles.footPage}
            render={({ pageNumber, totalPages }) =>
              `صفحة ${eastern(pageNumber)} من ${eastern(totalPages)}`
            }
          />
        </View>

        {/* ===== الترويسة الرسمية — الصفحة الأولى ===== */}
        <View style={styles.masthead} wrap={false}>
          <View style={styles.mastRow}>
            <View style={styles.brandCol}>
              <Text style={styles.brand}>كلام له لازمة</Text>
              <Text style={styles.brandSub}>منصة فكرية واعية — بلا ضجيج، بلا إعلانات</Text>
              <Text style={styles.metaLine}>{metaParts.join("  ·  ")}</Text>
            </View>
            {input.qrDataUrl && (
              <View style={styles.qrCol} wrap={false}>
                <Image src={input.qrDataUrl} style={styles.qrImg} />
                <Text style={styles.qrCaption}>
                  امسح الرمز للوصول إلى النسخة التفاعلية والاستماع للتسجيل الصوتي
                </Text>
              </View>
            )}
          </View>
          {/* الخط الفاصل الذهبي الرسمي */}
          <View style={styles.goldRule} />
        </View>

        {/* ===== صورة الغلاف — احتواء كامل بالنسبة التناسبية الحقيقية =====
            الأبعاد محسوبة من نسبة الصورة الفعلية (coverRatio من sharp):
            لا اقتطاع طوليًا ولا عرضيًا، ولا تشويه — تقع كاملة في الصفحة */}
        {input.coverImage && <Image src={input.coverImage} style={coverStyle(input.coverRatio)} />}

        {/* ===== عنوان المقال ===== */}
        <Text style={styles.title}>{input.title}</Text>
        {input.summary ? <Text style={styles.summary}>{input.summary}</Text> : null}

        {/* ===== متن المقال ===== */}
        <View style={styles.body}>
          {blocks.map((b) => (
            <BlockNode key={b.id} block={b} />
          ))}
        </View>

        {/* ===== خاتمة الوثيقة ===== */}
        <View style={styles.docEnd} wrap={false}>
          <View style={styles.endRule} />
          <Text style={styles.endText}>
            نُشرت هذه الوثيقة من منصة «كلام له لازمة» — النسخة التفاعلية بصوت القارئ
            والنص المشكول عبر رمز الاستجابة أعلاه أو الرابط في تذييل كل صفحة.
          </Text>
          <Text style={styles.endBrand}>كلام له لازمة — فكر بلا ضجيج</Text>
        </View>
      </Page>
    </Document>
  );
}

/* ==================== الأنماط الطباعية ==================== */

/** أبعاد الغلاف المحتوية — أكبر مقاس يحترم النسبة الحقيقية داخل
    عرض المحتوى (503pt) وسقف ارتفاعي مريح (300pt) بلا أي قص أو مط */
function coverStyle(ratio: number | null): {
  width: number | string;
  height: number | string;
  objectFit: "contain";
  borderRadius: number;
  marginTop: number;
} {
  const CONTENT_W = 503; // A4 (595.28) − هوامش جانبية (2×46)
  const MAX_H = 300;
  if (ratio && ratio > 0) {
    const h = Math.min(MAX_H, CONTENT_W / ratio);
    return { width: h * ratio, height: h, objectFit: "contain", borderRadius: 6, marginTop: 16 };
  }
  /* احتياط بلا نسبة معروفة — احتواء كامل داخل إطار ثابت */
  return { width: "100%", height: 195, objectFit: "contain", borderRadius: 6, marginTop: 16 };
}

const styles = StyleSheet.create({
  page: {
    /* هوامش A4 مكتبية بمساحة أمان سفلية واسعة (~28mm) — أسطر المتن
       تنتهي فوق التذييل بهامش فاصل لا يُخترق مهما طال المقال */
    paddingTop: 56,
    paddingBottom: 80,
    paddingHorizontal: 46,
    backgroundColor: "#FFFFFF",
    fontFamily: "Amiri",
    fontSize: 12.5,
    color: INK,
  },

  /* ---------- التذييل الثابت (سطر واحد ثابت الارتفاع) ---------- */
  footer: {
    position: "absolute",
    bottom: 24,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.7,
    borderTopColor: FAINT,
    paddingTop: 8,
  },
  footRight: { fontFamily: "Tajawal", fontSize: 8, color: GOLD, fontWeight: 700 },
  /* الرابط: خلية مرنة تتقلص دائمًا بين الجارين — النص الكامل المفكوك
     يلتف عند الشرطات إلى سطرين كحد أقصى دون أن يلمس رقم الصفحة أبدًا */
  footCenter: {
    fontFamily: "Tajawal",
    fontSize: 7,
    color: STEEL,
    flex: 1,
    marginHorizontal: 10,
    textAlign: "center",
    lineHeight: 1.5,
  },
  footPage: { fontFamily: "Tajawal", fontSize: 8, color: DARK, fontWeight: 700 },

  /* ---------- الترويسة الرسمية ---------- */
  masthead: { marginBottom: 18 },
  mastRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  brandCol: { flex: 1, paddingTop: 4 },
  brand: { fontFamily: "Tajawal", fontSize: 21, fontWeight: 700, color: DARK },
  brandSub: { fontFamily: "Tajawal", fontSize: 8.5, color: STEEL, marginTop: 3 },
  metaLine: { fontFamily: "Tajawal", fontSize: 9, color: INK, marginTop: 10, lineHeight: 1.6 },
  qrCol: { alignItems: "center", width: 92 },
  qrImg: { width: 64, height: 64 },
  qrCaption: {
    fontFamily: "Tajawal",
    fontSize: 6.2,
    color: STEEL,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 1.5,
  },
  goldRule: {
    marginTop: 12,
    height: 1.6,
    backgroundColor: GOLD,
    borderRadius: 1,
  },

  /* ---------- الغلاف والعنوان ---------- */
  title: {
    fontFamily: "Amiri",
    fontSize: 23,
    fontWeight: 700,
    lineHeight: 1.55,
    color: INK,
    textAlign: "right",
    marginTop: 18,
  },
  summary: {
    fontFamily: "Tajawal",
    fontSize: 10,
    lineHeight: 1.85,
    color: STEEL,
    textAlign: "right",
    marginTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 0.7,
    borderBottomColor: FAINT,
  },

  /* ---------- المتن — سطر 2.2 مريح للعربية المحركة ومحاذاة يمين
      صريحة (لا justify قسري يُمطّ المسافات ويشوه التشكيل) ---------- */
  body: { marginTop: 6 },
  p: { fontSize: 12.5, lineHeight: 2.2, textAlign: "right", marginTop: 9, color: INK },

  h2Box: { marginTop: 16, marginBottom: 2 },
  h2: { fontFamily: "Tajawal", fontSize: 15.5, fontWeight: 700, color: DARK, textAlign: "right" },
  h3Box: { marginTop: 12, marginBottom: 2 },
  h3: { fontFamily: "Tajawal", fontSize: 13, fontWeight: 700, color: INK, textAlign: "right" },

  quoteBox: {
    marginVertical: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FDFBF7",
    borderRightWidth: 2.4,
    borderRightColor: GOLD,
    borderRadius: 3,
  },
  quoteText: { fontSize: 12.5, lineHeight: 2.1, color: INK, textAlign: "right" },

  listBox: { marginTop: 8, paddingHorizontal: 4 },
  /* RTL حقيقي: الرقم/الرمزة في أقصى يمين الصفحة والنص يسارها —
     row-reverse يضع أول عنصر (الرمز) على اليمين كما تُقرأ القوائم العربية */
  listRow: { flexDirection: "row-reverse", gap: 7, marginBottom: 4 },
  bullet: { fontFamily: "Tajawal", fontSize: 11, color: GOLD, fontWeight: 700, width: 18, textAlign: "center" },
  listText: { flex: 1, fontSize: 12, lineHeight: 2.05, textAlign: "right" },

  hr: { height: 0.8, backgroundColor: FAINT, marginVertical: 14 },

  quranBox: {
    marginVertical: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#F7FAF1",
    borderRadius: 5,
    borderTopWidth: 0.8,
    borderBottomWidth: 0.8,
    borderTopColor: "#D9E5C3",
    borderBottomColor: "#D9E5C3",
  },
  quranText: { fontSize: 13.5, lineHeight: 2.1, color: "#3F6212", textAlign: "center" },
  quranRef: { fontFamily: "Tajawal", fontSize: 8, color: OLIVE, textAlign: "center", marginTop: 5 },

  hadithBox: {
    marginVertical: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 5,
    borderRightWidth: 2.2,
    borderRightColor: "#64748B",
  },
  hadithText: { fontSize: 12.5, lineHeight: 2.05, color: "#334155", textAlign: "right" },
  hadithRef: { fontFamily: "Tajawal", fontSize: 8, color: STEEL, textAlign: "right", marginTop: 5 },

  noteBox: {
    marginVertical: 9,
    padding: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 4,
    border: 0.7,
    borderColor: "#FDE68A",
  },
  noteLabel: { fontFamily: "Tajawal", fontSize: 8.5, fontWeight: 700, color: GOLD, marginBottom: 3 },
  noteText: { fontSize: 11, lineHeight: 1.75, textAlign: "right", color: "#713F12" },

  questionBox: {
    marginVertical: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "#FAFAF9",
    border: 0.8,
    borderColor: GOLD,
  },
  questionLabel: { fontFamily: "Tajawal", fontSize: 8.5, fontWeight: 700, color: GOLD, marginBottom: 3 },
  questionText: { fontSize: 12, lineHeight: 1.8, textAlign: "right", color: INK },

  tableBox: {
    marginVertical: 10,
    borderWidth: 0.8,
    borderColor: FAINT,
    borderRadius: 4,
    overflow: "hidden",
  },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: FAINT },
  tableHeadRow: { backgroundColor: "#F8FAFC" },
  tableCell: {
    flex: 1,
    fontFamily: "Tajawal",
    fontSize: 9,
    lineHeight: 1.6,
    padding: 6,
    borderRightWidth: 0.5,
    borderRightColor: FAINT,
    textAlign: "right",
  },
  tableHeadCell: { fontWeight: 700, color: DARK, backgroundColor: "#F8FAFC" },

  /* ---------- خاتمة الوثيقة ---------- */
  docEnd: { marginTop: 26 },
  endRule: { height: 1.2, backgroundColor: GOLD, borderRadius: 1, marginBottom: 10 },
  endText: { fontFamily: "Tajawal", fontSize: 8.5, lineHeight: 1.85, color: STEEL, textAlign: "right" },
  endBrand: {
    fontFamily: "Tajawal",
    fontSize: 10,
    fontWeight: 700,
    color: DARK,
    textAlign: "center",
    marginTop: 12,
  },
});

/** توليد ملف PDF جاهز للطباعة والحفظ المكتبي */
export async function renderArticlePdf(input: ArticlePdfInput): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<ArticlePdf {...input} />);
}
