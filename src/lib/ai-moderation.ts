/**
 * ============================================================
 * محرك الرقابة الأخلاقية الفورية بالذكاء الاصطناعي — «كلام له لازمة»
 * ============================================================
 * نداء خفيف جدًا على gemini-3.5-flash-lite قبل حفظ أي تعليق،
 * يُلزم النموذج بالرد بصيغة JSON مغلقة: { "approved": boolean, "reason": string }
 *
 * المعايير الصارمة:
 *  - خلو التعليق من الألفاظ النابية
 *  - التجريح الشخصي
 *  - مخالفة الشريعة والقيم الإسلامية
 *  - مخالفة العادات والتقاليد العربية والمصرية الأصيلة
 *  - حجب الـ Spam والإعلانات
 *
 * عند أي عطل (انقطاع/حصة/مهلة) يعيد checked:false — فتُكمل
 * الفلترة المحلية متعددة المستويات ومراجعة فريق التحرير عملهما دون عطَل.
 */

import { geminiChat, geminiConfigured, extractJson, GeminiError } from "./gemini-chat";

export type AiModerationVerdict = {
  approved: boolean;
  reason: string;
  checked: boolean; // هل مرّ فعليًا على النموذج؟
};

const SYSTEM_PROMPT = `أنت محرك رقابة أخلاقية فوري لمنصة «كلام له لازمة» — منصة مقالات فكرية عربية رصينة.
مهمتك فحص التعليق القادم وحسم قرارك فورًا وفق المعايير الصارمة التالية:
1. الألفاظ النابية أو البذيئة بأي صيغة أو تلوين أو تشفير.
2. التجريح الشخصي أو السخرية الجارحة الموجهة للكاتب أو لمعلّق آخر أو لأي فرد أو فئة.
3. مخالفة الشريعة الإسلامية والقيم الإسلامية: التكفير، سب الدين أو الله أو الرسول أو القرآن، التحريض، الخلافات المذهبية الحاقدة.
4. مخالفة العادات والتقاليد العربية والمصرية الأصيلة: التشهير، العيب العام، مخالفة الحياء العام.
5. السبام: إعلانات، روابط ترويجية، أرقام هواتف، ترويج قنوات أو منتجات، تكرار مفتعل.
أمثلة مقبولة تمامًا: الرأي المخالف المهذب، النقد الفكري الموضوعي، السؤال الجاد، اختلاف وجهة النظر بلغة محترمة — فالمنصة منصة حوار لا ترفض الخلاف، بل ترفض قبح الأسلوب.
ردّك إلزامي بصيغة JSON مغلقة فقط، بلا أي كلام خارجها، بالحقلة الآتية فقط:
{"approved": boolean, "reason": "سبب موجز بالعربية عند الرفض، وسلسلة فارغة عند القبول"}`;

/** فحص تعليق بالنموذج — نداء خفيف واحد بمهلة قصيرة */
export async function aiModerate(content: string): Promise<AiModerationVerdict> {
  if (!geminiConfigured()) {
    return { approved: true, reason: "", checked: false };
  }

  try {
    const raw = await geminiChat({
      system: SYSTEM_PROMPT,
      turns: [{ role: "user", text: `التعليق المطلوب فحصه:\n"""\n${content.slice(0, 1200)}\n"""` }],
      maxOutputTokens: 200,
      temperature: 0.1,
      jsonMode: true,
      timeoutMs: 12_000,
    });

    /* SAFETY: النموذج حجب المدخل نفسه — نقبل حسمه برفض مهذب */
    if (raw === "") {
      return {
        approved: false,
        reason: "تعليقك يخالف أدب الحوار — راجع بنود صفحة «أخلاقيات الحوار والتعليق»",
        checked: true,
      };
    }

    const verdict = extractJson<{ approved?: boolean; reason?: string }>(raw);
    if (!verdict || typeof verdict.approved !== "boolean") {
      return { approved: true, reason: "", checked: false };
    }

    return {
      approved: verdict.approved,
      reason:
        verdict.approved
          ? ""
          : (verdict.reason ?? "").trim() ||
            "تعليقك يخالف أدب الحوار — راجع بنود صفحة «أخلاقيات الحوار والتعليق»",
      checked: true,
    };
  } catch (err) {
    /* العطل لا يحجب الحوار أبدًا — الفلترة المحلية ومراجعة التحرير تكملان */
    if (err instanceof GeminiError && err.status === 429) {
      return { approved: true, reason: "", checked: false };
    }
    return { approved: true, reason: "", checked: false };
  }
}
