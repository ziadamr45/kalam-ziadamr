import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitDurable, requestIp, logSecurityEvent } from "@/lib/rate-limit";
import { recordServerError } from "@/lib/error-alert";
import { dispatchAdminEvent } from "@/lib/notifications/dispatcher";

/**
 * الإبلاغ عن تعليق — مسار عام (بلا جلسة) لذا هو أكثر مسار يستهدفه
 * الإغراق: فخ Honeypot + حد معدل صارم لكل IP + تحقق مخطط صارم.
 */

const reportSchema = z.object({
  commentId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(500).optional().default(""),
  fp: z.string().max(128).optional().default(""),
  /* فخ الروبوتات — حقل مخفي لا يراه الإنسان، البوت يملؤه */
  honey: z.string().max(200).optional().default(""),
});

const REPORT_REASONS = new Set([
  "إساءة أو لغة غير لائقة",
  "إعلان أو سبام",
  "مخالفة القيم",
  "سبب آخر",
]);

export async function POST(request: Request) {
  const ip = requestIp(request);
  try {
    /* حد المعدل: 3 بلاغات / 5 دقائق لكل IP — درع مزدوج:
       ذاكرة النسخة الفوري + العداد الدائم العابر للنسخ عبر RequestLog */
    const mem = rateLimit(`report:${ip}`, 3, 5 * 60_000);
    const durable = await rateLimitDurable({ path: "/api/comments/report", ip, limit: 3, windowMs: 5 * 60_000 });
    if (!mem.ok || !durable.ok) {
      logSecurityEvent({
        type: "RATE_LIMIT",
        message: `تجاوز حد البلاغات من ${ip} — تعثر ${Math.max(mem.retryAfterSec, durable.retryAfterSec)}ث`,
        meta: { ip, path: "/api/comments/report" },
      });
      return NextResponse.json(
        { error: "وصلنا عدد من البلاغات — حاول لاحقًا" },
        { status: 429, headers: { "Retry-After": String(Math.max(mem.retryAfterSec, durable.retryAfterSec)) } },
      );
    }

    const parsed = reportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const { commentId, reason, details, fp, honey } = parsed.data;

    /* فخ السبام — إن امتلأ فهو بوت: نتجاهله بصمت تامة بلا أي استهلاك موارد */
    if (honey) {
      logSecurityEvent({
        type: "HONEYPOT",
        message: `فخ بلاغات التقط روبوتًا من ${ip}`,
        meta: { ip, path: "/api/comments/report" },
      });

    return NextResponse.json({ ok: true });
    }

    /* السبب من القائمة المعتمدة حصرًا — لا نصوص حرة في خانة السبب */
    if (!REPORT_REASONS.has(reason)) {
      return NextResponse.json({ error: "سبب الإبلاغ غير معروف" }, { status: 400 });
    }

    /* «سبب آخر» يستوجب وصفًا مخصصًا إلزاميًا — بلا وصف يُرفض الإبلاغ */
    const isCustom = reason === "سبب آخر";
    const customDetail = details || "";
    if (isCustom && customDetail.length < 5) {
      return NextResponse.json(
        { error: "صف المخالفة بدقة في الحقل المخصص — الوصف إلزامي لسبب آخر" },
        { status: 400 },
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, article: { select: { title: true, slug: true } } },
    });
    if (!comment) {
      return NextResponse.json({ error: "التعليق غير موجود" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.commentReport.create({
        data: {
          commentId,
          reason,
          details: customDetail || null,
          reporterFp: fp || null,
        },
      }),
      prisma.comment.update({
        where: { id: commentId },
        data: { reportCount: { increment: 1 } },
      }),
    ]);

    /* ثلاثة إبلاغات أو أكثر → رفع العلم للمراجعة الأولوية */
    const updated = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { reportCount: true },
    });
    if ((updated?.reportCount ?? 0) >= 3) {
      await prisma.comment.update({
        where: { id: commentId },
        data: { flagged: true },
      });
    }


      /* حدث سيادة: بلاغ جديد على تعليق — لوحة الأدمن + رنين هادئ لهواتف الإدارة */
    void dispatchAdminEvent({
      type: "ADMIN_COMMENT_REPORTED",
      title: `بلاغ جديد عن تعليق في مقال: ${(comment.article?.title ?? "بدون عنوان").slice(0, 80)}`,
      message: `السبب: ${reason}${customDetail ? ` — ${customDetail.slice(0, 100)}` : ""}`,
      link: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/comments?flagged=1`,
      pushTag: "comment-reported",
      metadata: { commentId, reason, articleSlug: comment.article?.slug ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/comments/report",
      method: "POST",
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
