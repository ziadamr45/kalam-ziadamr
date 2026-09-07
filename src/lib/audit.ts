import { prisma } from "@/lib/prisma";

/**
 * سجلات الشفافية الرقابية — كل حركة في المنصة تصل إلى علم الأدمن فورًا.
 * التسجيل fire-and-forget: لا يُعطّل تجربة المستخدم أبدًا إن فشل الكتابة.
 */

export type AuditEventType =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_BLOCKED"
  | "AUTH_SIGNOUT"
  | "COMMENT_SUBMITTED"
  | "COMMENT_REJECTED"
  | "VOTE"
  | "SAVE_ARTICLE"
  | "CONTACT_MESSAGE"
  | "PAGE_ERROR"
  | "AVATAR_UPDATED"
  | "ACCOUNT_SELF_DELETED";

export async function logEvent(input: {
  type: AuditEventType;
  actorType?: "USER" | "GUEST" | "SYSTEM";
  actorId?: string | null;
  actorLabel?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        type: input.type,
        actorType: input.actorType ?? "GUEST",
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        message: input.message ?? null,
        meta: (input.meta ?? undefined) as never,
        path: input.path ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
      },
    });
  } catch {
    // فشل التسجيل غير حرج إطلاقًا
  }
}

/**
 * رفع تقرير خطأ لحظي — تجميع الأخطاء المتطابقة (digest) مع عدّاد
 * حتى لا تُغرق قاعدة البيانات نسخًا متكررة من نفس العطل.
 */
export async function logErrorReport(input: {
  message: string;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
  digest: string;
}): Promise<void> {
  try {
    await prisma.errorReport.upsert({
      where: { digest: input.digest },
      update: {
        count: { increment: 1 },
        lastSeenAt: new Date(),
        stack: input.stack?.slice(0, 4000) ?? null,
      },
      create: {
        digest: input.digest,
        message: input.message.slice(0, 500),
        stack: input.stack?.slice(0, 4000) ?? null,
        path: input.path ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
      },
    });
  } catch {
    // لا شيء — التقرير غير حرج
  }
}

/** استخراج IP الزائر من ترويسات Vercel */
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}
