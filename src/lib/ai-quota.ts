import "server-only";
import crypto from "crypto";

/**
 * ============================================================
 * حصة نقاش الذكاء الاصطناعي — تخزين دائم للزوار غير المسجلين
 * ============================================================
 * كوكي HTTP-Only موقعة (HMAC-SHA256) تحمل مصفوفة المقالات وعدد
 * الرسائل المستهلكة في كل مقال — لا يمكن للعميل تزويرها أو تصفيرها
 * لأن أي عبث يكسر التوقيع وتُعامل الكوكي كأنها غير موجودة.
 * الصلاحية 24 ساعة من آخر تحديث، والتحقق يتم في الخادم حصريًا.
 */

export const AI_QUOTA_COOKIE = "kalam_aiq";
const MAX_AGE_SEC = 24 * 60 * 60; // 24 ساعة
const MAX_TRACKED_ARTICLES = 40; // سقف المقالات المتتبعة داخل الكوكي

function signingSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.REVALIDATE_SECRET ??
    "kalam-aiq-dev-fallback-secret"
  );
}

type GuestQuotaPayload = {
  v: 1;
  /** انتهاء الصلاحية — ثوانٍ منذ Unix Epoch */
  exp: number;
  /** خريطة articleId → عدد الرسائل المستهلكة */
  u: Record<string, number>;
};

function hmac(payload: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/** توقيع وتغليف خريطة الاستهلاك في كوكي جاهزة للإرسال */
export function encodeGuestQuota(counts: Record<string, number>): {
  value: string;
  maxAge: number;
} {
  const body: GuestQuotaPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
    u: pruneCounts(counts),
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return { value: `${payload}.${hmac(payload)}`, maxAge: MAX_AGE_SEC };
}

/**
 * قراءة والتحقق من كوكي الزائر:
 * توقيع خاطئ أو منتهي أو مشوه → {} (تُعامل كقارئ جديد).
 */
export function decodeGuestQuota(raw: string | undefined | null): Record<string, number> {
  if (!raw) return {};
  try {
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return {};
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = hmac(payload);
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return {};
    }
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as GuestQuotaPayload;
    if (body?.v !== 1 || typeof body.exp !== "number" || body.exp * 1000 < Date.now()) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.u ?? {})) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && k.length <= 64) {
        out[k] = Math.min(Math.floor(v), 99);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** تقليم الخريطة: إسقاط الأصفار والاحتفاظ بآخر مقالات النقاش فقط */
export function pruneCounts(counts: Record<string, number>): Record<string, number> {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  return Object.fromEntries(entries.slice(-MAX_TRACKED_ARTICLES));
}

/** قراءة كوكي بالاسم من ترويسة الطلب الخام */
export function readCookieFromRequest(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}
