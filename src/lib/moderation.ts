/**
 * ============================================================
 * محرك الفلترة الأخلاقية متعدد المستويات — «كلام له لازمة»
 * ============================================================
 * يعمل على العميل (فحص لحظي قبل الإرسال) وعلى الخادم (فرض نهائي).
 * المستوى اللحظي: Blocklist regex للألفاظ النابية والإساءات.
 * المستوى القيمي: أنماط ما يخالف الشريعة والقيم العربية الأصيلة.
 * مستوى مكافحة الإعلانات: أنماط Spam الواضحة.
 * يعيد قرارًا (REJECT / PENDING / APPROVED) مع درجة خطورة وأسباب عربية.
 */

export type ModerationVerdict = {
  status: "REJECT" | "PENDING" | "APPROVED";
  flagged: boolean;
  reasons: string[];
  riskScore: number;
};

/** تطبيع النص العربي: تجريد التشكيل + توحيد الحروف */
export function normalizeArabic(input: string): string {
  return input
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // التشكيل والتطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/* ------------------ القائمة الأولى: ألفاظ صريحة ------------------ */
const PROFANITY_PATTERNS: RegExp[] = [
  /شرامط|شرموط|شرموت/,
  /عاهرات?|عواير/,
  /قحاب|قحبه|قحبه/,
  /زانيه?|زنا محارم/,
  /خنازير|خنزيره?/,
  /يا كلب|يا كلاب|انتل|كلب بني ادم/,
  /يا حمار|حمير يا|يا حماره?/,
  /قذر|وسخ[^ي]|وسيخ/,
  /حقيره?|سافل|بذيء|بائخ/,
  /اهبل|اغبياء|غبي\b|معتوه|ابله/,
  /طيزك|طيز\b/,
  /وسخه|مقزز/,
  /ابن الكلب|ابن الحمار|ابن العاهرة/,
  /كلبان? عند|اكلخ|اهيج|تافهه?/,
];

/* ------------------ القائمة الثانية: القيم والشريعة ------------------ */
const VALUES_PATTERNS: RegExp[] = [
  /اللعنه|لعنه الله|يلعن[^ال]|ملعون/,
  /تكفير الناس|كلهم كفار|كفار يا|يا كفار/,
  /(الله|الرحمن)[^\u0621-\u064A]{0,12}(سب|قبح|لعن)/,
  /(سب|قبح|لاعن)[^\u0621-\u064A]{0,12}(الله|الرسول|النبي|القران|الدين|الاسلام|الصحابه)/,
  /الدين الكذب|دين الكذب|الاسلام الخرافه/,
  /خرافات الدين|خرافه[^ا]? الدين/,
];

/* ------------------ القائمة الثالثة: مكافحة الإعلانات ------------------ */
const SPAM_PATTERNS: RegExp[] = [
  /https?:\/\//g,
  /\b01[0125][0-9]{8}\b/, // أرقام هواتف مصرية
  /\+\d{9,}/,
  /تليجرام|تلجرام|واتساب|واتس|قنات?نا|كروبنا|جروبنا/,
  /فوركس|بيتكوين|كريبتو|عملات رقميه|ربح مضمون|ارباح مضمونه/,
  /اضغط هنا|انقر هنا|سجل الان|احصل مجانا/,
  /زياده متابعين|شراء متابعين|متابعين رخيص/,
  /كوبون|خصم[^ا]? حصري|عرض محدود|تخفيضات/,
];

const NOISE_MAX_LENGTH = 2000;
const NOISE_MIN_LENGTH = 3;

/** الفحص الكامل لتعليق */
export function analyzeComment(rawContent: string): ModerationVerdict {
  const content = (rawContent ?? "").trim();
  const normalized = normalizeArabic(content);
  const reasons: string[] = [];
  let riskScore = 0;
  let flagged = false;

  // نص فارغ أو ضجيج بنيوي
  if (content.length < NOISE_MIN_LENGTH) {
    return {
      status: "REJECT",
      flagged: false,
      reasons: ["التعليق قصير جدًا أو فارغ"],
      riskScore: 1,
    };
  }

  // المستوى اللحظي: ألفاظ نابية
  const profanityHit = PROFANITY_PATTERNS.some((re) => re.test(normalized));
  if (profanityHit) {
    reasons.push("يحتوي لغة غير لائقة");
    return { status: "REJECT", flagged: true, reasons, riskScore: 1 };
  }

  // المستوى القيمي: مخالفة الشريعة والقيم
  const valuesHit = VALUES_PATTERNS.some((re) => re.test(normalized));
  if (valuesHit) {
    reasons.push("يخالف القيم والأدب العام");
    return { status: "REJECT", flagged: true, reasons, riskScore: 1 };
  }

  // مستوى الإعلانات
  let spamHits = 0;
  for (const re of SPAM_PATTERNS) {
    const matches = normalized.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
    const count = matches ? matches.length : 0;
    if (count > 0) spamHits += Math.min(count, 2);
  }
  if (spamHits >= 2) {
    reasons.push("يبدو إعلانيًا أو محتوى مزعجًا (Spam)");
    return { status: "REJECT", flagged: true, reasons, riskScore: 0.9 };
  }
  if (spamHits === 1) {
    flagged = true;
    riskScore = Math.max(riskScore, 0.55);
    reasons.push("يحتوي عناصر مشتبه بها (رابط أو عرض)");
  }

  // الضجيج البنيوي
  if (content.length > NOISE_MAX_LENGTH) {
    flagged = true;
    riskScore = Math.max(riskScore, 0.4);
    reasons.push("طول غير معتاد يحتاج مراجعة");
  }
  if (/(.)\1{4,}/.test(normalized)) {
    flagged = true;
    riskScore = Math.max(riskScore, 0.45);
    reasons.push("تكرار حروف غير طبيعي");
  }

  if (riskScore === 0) riskScore = 0.1;

  // الوضع الافتراضي: كل التعليقات تمر من مراجعة الأدمن أولًا
  return { status: "PENDING", flagged, reasons, riskScore };
}
