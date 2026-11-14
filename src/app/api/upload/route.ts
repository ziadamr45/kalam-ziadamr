import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadImage, cloudinaryConfigured } from "@/lib/cloudinary";
import { bumpApiUsage } from "@/lib/api-usage";
import { rateLimit, rateLimitDurable, requestIp, logSecurityEvent } from "@/lib/rate-limit";
import { recordServerError } from "@/lib/error-alert";

/**
 * رفع صور سحابي عبر Cloudinary — السيرفر فقط.
 * سرّ الـ API يبقى خلف الخادم ولا يقترب من المتصفح أبدًا.
 *
 * دروع الإطلاق الجماهيري:
 *  - حد معدل مزدوج (ذاكرة النسخة + عداد دائم عابر للنسخ عبر RequestLog):
 *    10 رفعات في الساعة لكل مستخدم ولكنه IP — يمنع استنزاف مساحة
 *    وباندودث Cloudinary بحمل آلي.
 *  - مجلد الرفع مثبّت خادميًا على kalam/accounts حصريًا — الموقع العام
 *    لا يسمح لأي قارئ باختيار مجلد المقالات مهما مزّع FormData.
 *  - هوية الملف تُقرأ من Magic Bytes الفعلية لا من file.type المرسل
 *    من المتصفح (قابل للتزوير كليًا): يُقبل JPEG / PNG / WebP فقط،
 *    ويُمنع SVG نهائيًا (شعار رسمي بصيغة svg يقود XSS مخزّنًا).
 */

/* الحد المشترك: 10 رفعات/ساعة */
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW = 60 * 60_000;

/** قراءة بصمة الملف الحقيقية من أول 16 بايت */
async function sniffImageKind(file: Blob): Promise<"jpeg" | "png" | "webp" | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (head.length < 12) return null;
    /* JPEG: FF D8 FF */
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
    /* PNG: 89 50 4E 47 0D 0A 1A 0A */
    if (
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
      head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
    ) {
      return "png";
    }
    /* WebP: RIFF .... WEBP */
    const ascii = (from: number, len: number) =>
      String.fromCharCode(...head.slice(from, from + len));
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
    return null; // يشمل SVG وأي صيغة أخرى — تُرفض كليًا
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }
  const userId = session.user.id;
  const ip = requestIp(request);

  /* درع الحصة: ذاكرة النسخة لكل مستخدم ولكل IP + العداد الدائم العابر للنسخ */
  const memUser = rateLimit(`upload:u:${userId}`, UPLOAD_LIMIT, UPLOAD_WINDOW);
  const memIp = rateLimit(`upload:ip:${ip}`, UPLOAD_LIMIT, UPLOAD_WINDOW);
  const durable = await rateLimitDurable({
    path: "/api/upload",
    ip,
    limit: UPLOAD_LIMIT,
    windowMs: UPLOAD_WINDOW,
  });
  if (!memUser.ok || !memIp.ok || !durable.ok) {
    logSecurityEvent({
      type: "RATE_LIMIT",
      message: `تجاوز حد رفع الصور من ${session.user.email ?? userId}`,
      meta: { ip, userId, path: "/api/upload" },
      severity: "WARN",
    });
    return NextResponse.json(
      { error: "تجاوزت حد رفع الصور لهذه الساعة — حاول لاحقًا" },
      { status: 429, headers: { "Retry-After": String(Math.max(memUser.retryAfterSec, memIp.retryAfterSec, durable.retryAfterSec)) } },
    );
  }

  if (!cloudinaryConfigured) {
    return NextResponse.json(
      { error: "خدمة رفع الصور غير مهيأة — تُضاف مفاتيح Cloudinary إلى متغيرات البيئة" },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "لم يُرفق ملف" }, { status: 400 });
    }

    /* الحد الأقصى 8MB */
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "الصورة أكبر من 8MB — اختر صورة أخف" }, { status: 413 });
    }

    /* الهوية من البايتات الفعلية — file.type من المتصفح لا يُؤتكل منه */
    const kind = await sniffImageKind(file);
    if (!kind) {
      return NextResponse.json(
        { error: "صيغة غير مدعومة — تُقبل صور JPG أو PNG أو WebP فقط" },
        { status: 415 },
      );
    }

    /* المجلد مثبّت خادميًا: الموقع العام يرفع صور الحسابات فقط —
       قيمة folder من FormData تُتجاهل تمامًا */
    const filename = (form.get("filename") as string) || "image";
    const result = await uploadImage(file, filename, "kalam/accounts");

    /* تسجيل الرفع في سجل الحركة — وقود العداد الدائم العابر للنسخ */
    await prisma.requestLog
      .create({
        data: {
          requestId: randomUUID(),
          app: "PUBLIC",
          method: "POST",
          path: "/api/upload",
          status: 200,
          ip,
          userId,
          userEmail: session.user.email ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        },
      })
      .catch(() => {});

    /* عداد الاستهلاك الرقابي — شاشة الحصص بلوحة الأدمن */
    void bumpApiUsage("CLOUDINARY_UPLOAD");

    return NextResponse.json(result);
  } catch {
    /* لا تُسرّب تفاصيل الخطأ الداخلية للعميل — تُوثَّق خادميًا فقط */
    await recordServerError({
      err: new Error("upload failed"),
      app: "PUBLIC",
      path: "/api/upload",
      method: request.method,
      requestId: request.headers.get("x-kalam-rid"),
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "فشل الرفع السحابي — أعد المحاولة" }, { status: 500 });
  }
}
