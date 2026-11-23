import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComment, normalizeArabic } from "../src/lib/moderation";

/* تغطية معزولة لمحرك فلترة التعليقات — بلا قاعدة بيانات ولا بنية جديدة.
   الحدود المغطاة: التطبيع + بوابات القبول/الرفض/المراجعة في analyzeComment.
   غير مغطى هنا: فحوص الملكية داخل معالجات المسارات (مرتبطة بقاعدة البيانات). */

test("normalizeArabic strips tashkeel and tatweel", () => {
  assert.equal(normalizeArabic("السَّلَامُ عَلَيْكُمْ"), "السلام عليكم");
  assert.equal(normalizeArabic("الحـــمد لله"), "الحمد لله");
});

test("normalizeArabic unifies letter variants", () => {
  assert.equal(normalizeArabic("أإآٱ"), "اااا");
  assert.equal(normalizeArabic("هدى"), "هدي");
  assert.equal(normalizeArabic("مدرسة"), "مدرسه");
  assert.equal(normalizeArabic("مؤمن"), "مومن");
  assert.equal(normalizeArabic("سئل"), "سيل");
  assert.equal(normalizeArabic("ABC"), "abc");
});

test("empty or too-short comments are rejected without flagging", () => {
  for (const raw of ["", "  ", "اه", null as unknown as string, undefined as unknown as string]) {
    const v = analyzeComment(raw);
    assert.equal(v.status, "REJECT");
    assert.equal(v.flagged, false);
    assert.deepEqual(v.reasons, ["التعليق قصير جدًا أو فارغ"]);
  }
});

test("a normal clean comment goes to admin review (PENDING) unflagged", () => {
  const v = analyzeComment("كلام جميل جدًا، استفدت من المقال فعلًا وبارك الله فيك.");
  assert.equal(v.status, "PENDING");
  assert.equal(v.flagged, false);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.riskScore, 0.1);
});

test("profanity is rejected and flagged", () => {
  const v = analyzeComment("يا حمار ما هذا الكلام");
  assert.equal(v.status, "REJECT");
  assert.equal(v.flagged, true);
  assert.equal(v.riskScore, 1);
  assert.ok(v.reasons.includes("يحتوي لغة غير لائقة"));
});

test("profanity hidden with tashkeel is still caught after normalization", () => {
  const v = analyzeComment("يا حَمَّارٍ");
  assert.equal(v.status, "REJECT");
  assert.equal(v.flagged, true);
});

test("values violations are rejected and flagged", () => {
  const v = analyzeComment("هذا كله خرافات الدين");
  assert.equal(v.status, "REJECT");
  assert.equal(v.flagged, true);
  assert.ok(v.reasons.includes("يخالف القيم والأدب العام"));
});

test("a single suspicious element (one link) stays pending but flagged", () => {
  const v = analyzeComment("مقال رائع، شاركت رأيي هنا https://example.com للفائدة");
  assert.equal(v.status, "PENDING");
  assert.equal(v.flagged, true);
  assert.equal(v.riskScore, 0.55);
  assert.ok(v.reasons.includes("يحتوي عناصر مشتبه بها (رابط أو عرض)"));
});

test("an Egyptian phone number alone flags but does not reject", () => {
  const v = analyzeComment("رأي جميل وكلموني على 01012345678 للنقاش");
  assert.equal(v.status, "PENDING");
  assert.equal(v.flagged, true);
});

test("two or more spam elements are rejected as spam", () => {
  const v = analyzeComment("https://example.com واتساب قناتنا للربح");
  assert.equal(v.status, "REJECT");
  assert.equal(v.flagged, true);
  assert.equal(v.riskScore, 0.9);
  assert.ok(v.reasons.includes("يبدو إعلانيًا أو محتوى مزعجًا (Spam)"));
});

test("overlong comments are flagged for review, not rejected", () => {
  const v = analyzeComment("كلمة طيبة. " + "أ".repeat(2100));
  assert.equal(v.status, "PENDING");
  assert.equal(v.flagged, true);
  assert.ok(v.reasons.includes("طول غير معتاد يحتاج مراجعة"));
});

test("unnatural character repetition is flagged", () => {
  const v = analyzeComment("جميلللللل جدًا هذا المقال");
  assert.equal(v.flagged, true);
  assert.ok(v.reasons.includes("تكرار حروف غير طبيعي"));
});

test("a three-character comment passes the length gate", () => {
  const v = analyzeComment("صدقت");
  assert.notEqual(v.reasons[0], "التعليق قصير جدًا أو فارغ");
});