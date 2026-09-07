/**
 * عميل Gemini النصي — المنصة العامة (يعمل حصريًا على السيرفر).
 *
 * - النموذج المعتمد رسميًا: gemini-3.5-flash-lite (فائق السرعة، خفيف التكلفة).
 * - بدائل احتياطية إن تقاعد الاسم أو لم يتوفر للمفتاح + تراجع أُسّي على 429/5xx.
 * - لا يغادر المفتاح بيئة الخادم أبدًا.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

const CHAT_CANDIDATES = [
  process.env.GEMINI_CHAT_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter(Boolean) as string[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function friendlyError(status: number, body: string): string {
  if (body.includes("location is not supported") || body.includes("FAILED_PRECONDITION")) {
    return "الخدمة غير متاحة من منطقة هذا الخادم — يجب النشر في منطقة مدعومة (fra1)";
  }
  if (status === 401 || status === 403) {
    return "مفتاح الذكاء الاصطناعي غير مصرّح";
  }
  if (status === 429) {
    return "تجاوزنا الحصة اللحظية — انتظر قليلًا ثم أعد المحاولة";
  }
  if (status === 404) {
    return "النموذج غير متاح حاليًا";
  }
  return `تعذر الاتصال بخدمة النقاش (${status})`;
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string };
};

export function geminiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("PLACEHOLDER"),
  );
}

export type ChatTurn = { role: "user" | "model"; text: string };

/** استدعاء نصي واحد مع بدائل الموديلات والتراجع الأُسّي */
export async function geminiChat(opts: {
  system: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  if (!geminiConfigured()) {
    throw new GeminiError("خدمة الذكاء الاصطناعي غير مهيأة", 503);
  }

  const memo = (globalThis as Record<string, unknown>)["__working_chat"] as string | undefined;
  const models = memo ? [memo, ...CHAT_CANDIDATES.filter((m) => m !== memo)] : CHAT_CANDIDATES;
  let lastErr: unknown = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
      try {
        const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
            generationConfig: {
              maxOutputTokens: opts.maxOutputTokens ?? 800,
              temperature: opts.temperature ?? 0.75,
              ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: controller.signal,
        });

        const raw = await res.text();
        let json: GeminiResponse = {};
        try {
          json = JSON.parse(raw) as GeminiResponse;
        } catch {}

        if (!res.ok) {
          throw new GeminiError(friendlyError(res.status, raw), res.status);
        }

        (globalThis as Record<string, unknown>)["__working_chat"] = model;

        const text = json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim();

        if (!text) {
          /* SAFETY: النموذج حجب الطلب — نعامله كرفض مهذب لا كعطل */
          if (json.promptFeedback?.blockReason) {
            return "";
          }
          throw new GeminiError("وصلت استجابة فارغة — أعد المحاولة", 502);
        }
        return text;
      } catch (err) {
        lastErr = err;
        const status = err instanceof GeminiError ? err.status : 0;
        if (status === 404) break; // الموديل التالي فورًا
        if (status === 401 || status === 403) throw err;
        if (attempt < 3) await sleep(800 * Math.pow(2, attempt - 1) + Math.random() * 300);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (lastErr instanceof GeminiError) throw lastErr;
  throw new GeminiError("تعذر الاتصال بخدمة الذكاء الاصطناعي", 502);
}

/** استخراج JSON من رد النموذج (مع تحمّل أسوار الماركداون الاحتياطية) */
export function extractJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch {}
  }
  return null;
}
