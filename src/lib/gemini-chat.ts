/**
 * عميل Gemini النصي — المنصة العامة (يعمل حصريًا على السيرفر).
 *
 * - التوجيه الذكي الفوري (0ms):
 *   • الأسئلة العادية والسريعة → gemini-3.1-flash-lite (أوفر وأخف).
 *   • الأسئلة التحليلية/العميقة → gemini-3.5-flash-lite (أقوى في المنطق).
 * - بديل احتياطي تلقائي عبر Groq عند امتلاء الحصة (429) إذا توفر GROQ_API_KEY.
 * - لا يغادر المفتاح بيئة الخادم أبدًا.
 */

import "server-only";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const LITE_FIRST = [
  process.env.GEMINI_CHAT_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
].filter(Boolean) as string[];

const STRONG_FIRST = [
  process.env.GEMINI_CHAT_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
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
    (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("PLACEHOLDER")) ||
      process.env.GROQ_API_KEY,
  );
}

export type ChatTurn = { role: "user" | "model"; text: string };

async function callGroqFallback(opts: {
  system: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: opts.system },
          ...opts.turns.map((t) => ({
            role: t.role === "model" ? "assistant" : "user",
            content: t.text,
          })),
        ],
        max_tokens: opts.maxOutputTokens ?? 900,
        temperature: opts.temperature ?? 0.75,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** استدعاء نصي واحد مع التوجيه الذكي + بدائل الموديلات + بديل Groq عند 429 */
export async function geminiChat(opts: {
  system: string;
  turns: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  preferStrong?: boolean;
}): Promise<string> {
  if (!geminiConfigured()) {
    throw new GeminiError("خدمة الذكاء الاصطناعي غير مهيأة", 503);
  }

  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith("PLACEHOLDER"),
  );

  if (!hasGeminiKey) {
    const groqOnly = await callGroqFallback(opts);
    if (groqOnly) return groqOnly;
    throw new GeminiError("خدمة الذكاء الاصطناعي غير مهيأة", 503);
  }

  const models = Array.from(new Set(opts.preferStrong ? STRONG_FIRST : LITE_FIRST));
  let lastErr: unknown = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
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

        const text = json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim();

        if (!text) {
          if (json.promptFeedback?.blockReason) {
            return "";
          }
          throw new GeminiError("وصلت استجابة فارغة — أعد المحاولة", 502);
        }
        return text;
      } catch (err) {
        lastErr = err;
        const status = err instanceof GeminiError ? err.status : 0;
        if (status === 404 || status === 429) break; // انتقال فوري للموديل التالي بلا انتظار
        if (status === 401 || status === 403) throw err;
        if (attempt < 2) await sleep(600 + Math.random() * 250);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /* بديل احتياطي عبر Groq إذا امتلأت حصص Gemini (429) وتوفر GROQ_API_KEY */
  if (!opts.jsonMode && process.env.GROQ_API_KEY) {
    const groqReply = await callGroqFallback(opts);
    if (groqReply) return groqReply;
  }

  if (lastErr instanceof GeminiError) throw lastErr;
  throw new GeminiError("تعذر الاتصال بخدمة الذكاء الاصطناعي", 502);
}

/** استخراج JSON من رد النموذج */
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
