import test from "node:test";
import assert from "node:assert/strict";
import { suggestQuotes, stripLabel } from "../src/lib/quote-suggestions";

test("labels are removed from summary points", () => {
  assert.equal(stripLabel("الخلاصة: البركة في وضوح الاتجاه وإتقان الأثر."), "البركة في وضوح الاتجاه وإتقان الأثر.");
  assert.equal(stripLabel("نقطة قابلة للتطبيق: زن كل منشور قبل النشر."), "زن كل منشور قبل النشر.");
});
test("suggestions are complete sentences, never truncated or labelled", () => {
  const summary = "القاعدة الفكرية: كثرة المشاهدات ومجاراة الجموع لا تجعل الخطأ صوابًا، وقيمة الإنسان في ثبات مبدئه لا في سرعة تقليده.\nالخلاصة: العقل ليس ضد الفرح، لكن الإبداع الحقيقي ألا تبيع مبادئك من أجل لقطة عابرة.";
  const r = suggestQuotes("> **ليس مطلوبًا منك أن تعادي كل جديد… المطلوب فقط ألا تترك كل جديدٍ يعادي مبادئك.**", summary);
  assert.equal(r.length, 3);
  assert.ok(r.every((q) => !q.includes("**") && !q.includes("…") || q.startsWith("ليس")));
  assert.ok(r.some((q) => q.endsWith("تقليده.")));
  assert.ok(!r.some((q) => /^(القاعدة|الخلاصة)/.test(q)));
});
test("questions, verses and fragments are excluded", () => {
  const r = suggestQuotes("**هل هذا يرضي الله؟**\n**﴿وَقِفُوهُمْ إِنَّهُم مَّسْئُولُونَ﴾**\n**كأم:**", "");
  assert.deepEqual(r, []);
});
