/**
 * ============================================================
 * درع تحديد معدل الطلبات — Sliding-Window Rate Limiter
 * ============================================================
 * نافذة منزلقة بالذاكرة لكل نسخة خادم — خط الدفاع الأول الفوري
 * ضد الإغراق والروبوتات، يعمل بلا أي تبعيات خارجية ولا زمن شبكة.
 * الاستهداف: مسارات الكتابة العامة والمكشوفة (بلاغات، أخطاء،
 * تحليلات، بحث) — كل مفتاح له حصته الصارمة داخل نافذته.
 *
 * ملاحظة معمارية: التخزين لكل instance على Vercel؛ للحماية
 * القصوى على مسارات الدخول الحساسة يُستكمل بحد دائم في قاعدة
 * البيانات (كما في LoginAttempt باللوحة).
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** سقف الذاكرة الواقي من تسريبها — تُمسح عند التجاوز */
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  /** هل يُسمح بالطلب؟ */
  ok: boolean;
  /** ثوانٍ حتى السماح مجددًا (للترويسة Retry-After) */
  retryAfterSec: number;
  /** عدد الطلبات المتباحة في النافذة */
  remaining: number;
};

/**
 * فحص السماح لطلب واحد ضمن نافذة زمنية.
 * @param key هوية فريدة (IP أو userId أو مركبة)
 * @param limit أقصى عدد طلبات داخل النافذة
 * @param windowMs حجم النافذة بالمللي ثانية
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const fresh = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    const oldest = fresh[0] ?? now;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      remaining: 0,
    };
  }

  fresh.push(now);
  buckets.set(key, fresh);
  if (buckets.size > MAX_BUCKETS) buckets.clear();
  return { ok: true, retryAfterSec: 0, remaining: limit - fresh.length };
}

/* ============================================================
 * سجل الأحداث الأمنية المشترك — يصل لحلقة الأدمن مباشرة
 * (SecurityAlert) بخنق صارم حتى لا يُغرق الهجومُ السجلَّ نفسه
 * ============================================================ */

const eventThrottle = new Map<string, number>();
const EVENT_THROTTLE_MS = 10 * 60_000;

/**
 * توثيق حدث أمني (فخ بوت، تجاوز معدل، حجب ماسح) في SecurityAlert
 * بحيث يظهر مباشرة في مركز أمن لوحة التحكم — مرة واحدة لكل
 * نوع+مفتاح كل 10 دقائق، وفشله صامت تمامًا.
 */
export function logSecurityEvent(alert: {
  type: string;
  message: string;
  meta?: Record<string, unknown>;
  severity?: "INFO" | "WARN" | "CRITICAL";
}): void {
  try {
    const key = `${alert.type}:${JSON.stringify(alert.meta ?? {})}`.slice(0, 200);
    const now = Date.now();
    if ((eventThrottle.get(key) ?? 0) > now - EVENT_THROTTLE_MS) return;
    eventThrottle.set(key, now);
    if (eventThrottle.size > 2000) eventThrottle.clear();

    void (async () => {
      const { prisma } = await import("@/lib/prisma");
      await prisma.securityAlert
        .create({
          data: {
            type: alert.type,
            severity: alert.severity ?? "WARN",
            message: alert.message,
            meta: (alert.meta ?? undefined) as never,
          },
        })
        .catch(() => {});
    })();
  } catch {
    /* الأمن لا يعطل المسار أبدًا */
  }
}

/**
 * ============================================================
 * الحد الدائم العابر للنسخ — عبر RequestLog المشترك
 * ============================================================
 * الذاكرة لكل نسخة lambda على Vercel؛ الموجات المتوازية توزع
 * على نسخ متعددة فيفلت بعضها. الحد الدائم يعدّ الطلبات الفعلية
 * نفسها من سجل المرصد (كل طلب موثق بالوسيط بإب + مسار + فهرس
 * مركب) — دقة مطلقة بلا أي بنية إضافية، وفشله منفتح (fail-open)
 * فلا يعطل المنصة إن شحبت النبض لحظة.
 */

export async function rateLimitDurable(opts: {
  path: string;
  ip: string;
  /** الحد المسموح للطلبات السابقة داخل النافذة */
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const since = new Date(Date.now() - opts.windowMs);
    const previous = await prisma.requestLog.count({
      where: { path: opts.path, ip: opts.ip, createdAt: { gte: since } },
    });
    if (previous >= opts.limit) {
      return { ok: false, retryAfterSec: Math.ceil(opts.windowMs / 1000), remaining: 0 };
    }
    return { ok: true, retryAfterSec: 0, remaining: opts.limit - previous };
  } catch {
    /* فشل النبض لا يعطل المسار أبدًا */
    return { ok: true, retryAfterSec: 0, remaining: opts.limit };
  }
}

/** استخراج IP الطلب من ترويسات Vercel/الوكيل */
export function requestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
