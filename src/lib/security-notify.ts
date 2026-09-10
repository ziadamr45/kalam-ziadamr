import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logEvent } from "@/lib/audit";

/**
 * محرك أمن الحسابات السيادي — يلتقط كل دخول Google ويقارنه بالنشاط المعتاد:
 * بنصة الجهاز (UA) + الموقع التقريبي (ترويسات Vercel الطرفية أولًا ثم خدمة
 * جغرافية موثوقة كاحتياط) + نوع الجهاز والمتصفح ونظام التشغيل.
 *
 * عند الدخول من جهاز غير معتاد يُطلق التنبيه الأمني الفوري عبر ثلاث قنوات:
 *  1) بريد أمني عبر Resend (يُفعَّل تلقائيًا عند إضافة RESEND_API_KEY للبيئة)
 *  2) إشعار ويب فوري Web Push لكل أجهزة المستخدم المسجلة
 *  3) إشعار داخلي في جرس المنصة (UserNotification)
 *
 * مبدأ صارم: الأمن طبقة تراقب ولا تعترض أبدًا — أي عطل هنا لا يُفشل تسجيل
 * الدخول مهما حدث؛ كل النداءات محمية والتقاط كامل محصّن بحد زمني.
 */

/* ===================== تحليل سلسلة المتصفح (بلا مكتبات خارجية) ===================== */

export type UaInfo = { deviceType: string; browser: string; os: string };

export function parseUserAgent(ua: string | null | undefined): UaInfo {
  const s = (ua ?? "").slice(0, 400);
  const lower = s.toLowerCase();

  /* نوع الجهاز */
  let deviceType = "desktop";
  if (/ipad|tablet|playbook|silk|kindle/.test(lower)) deviceType = "tablet";
  else if (/mobi|iphone|android.*mobile|windows phone/.test(lower)) deviceType = "mobile";
  else if (/android/.test(lower)) deviceType = "tablet";

  /* المتصفح — الترتيب مهم (الأخص أولًا) */
  let browser = "متصفح";
  if (/edg\//.test(lower)) browser = "Edge";
  else if (/opr\/|opera/.test(lower)) browser = "Opera";
  else if (/samsungbrowser/.test(lower)) browser = "Samsung Internet";
  else if (/firefox\//.test(lower)) browser = "Firefox";
  else if (/chrome\//.test(lower)) browser = "Chrome";
  else if (/safari\//.test(lower)) browser = "Safari";

  /* نظام التشغيل */
  let os = "نظام غير معروف";
  if (/windows/.test(lower)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(lower)) os = "iOS";
  else if (/mac os x|macintosh/.test(lower)) os = "macOS";
  else if (/android/.test(lower)) os = "Android";
  else if (/linux/.test(lower)) os = "Linux";

  return { deviceType, browser, os };
}

/* ===================== الموقع الجغرافي التقريبي ===================== */

type GeoInfo = { city?: string | null; region?: string | null; country?: string | null };

/* كاش ساعة كاملة لكل عنوان IP — لا نُلجأ لخدمة خارجية مرتين لنفس الزائر */
const geoCache = new Map<string, { at: number; geo: GeoInfo }>();
const GEO_TTL_MS = 60 * 60 * 1000;

/**
 * الموقع التقريبي: ترويسات Vercel الطرفية فورية ودقيقة ومجانية أولًا،
 * وإن غابت (بيئة تطوير مثلًا) نلجأ لخدمة ipwho.is المجانية الموثوقة
 * بحد زمني 2.5 ثانية حتى لا نؤخر تسجيل الدخول أبدًا.
 */
export async function resolveGeo(
  ip: string | null,
  headers?: Headers | { get(name: string): string | null },
): Promise<GeoInfo> {
  /* أولًا: ترويسات Vercel الطرفية — متاحة في كل نداء إنتاجي */
  if (headers) {
    const city = headers.get("x-vercel-ip-city");
    const region = headers.get("x-vercel-ip-country-region");
    const country = headers.get("x-vercel-ip-country");
    if (city || country) {
      return {
        city: city ? decodeURIComponent(city) : null,
        region: region ?? null,
        country: country ?? null,
      };
    }
  }

  /* احتياطًا: خدمة خارجية موثوقة */
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|unknown)/i.test(ip)) {
    return {};
  }
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < GEO_TTL_MS) return cached.geo;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as {
      success?: boolean;
      city?: string | null;
      region?: string | null;
      country_code?: string | null;
    };
    const geo: GeoInfo = {
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country_code ?? null,
    };
    geoCache.set(ip, { at: Date.now(), geo });
    return geo;
  } catch {
    return {};
  }
}

/* ===================== بصمة الجهاز ===================== */

/**
 * بصمة الجهاز الفريدة — تجزئة SHA-256 مشتقة من (userId + User-Agent)
 * وفق المواصفة السيادية: كل حساب يملك سجل أجهزته المستقل، وبصمة لا
 * تتقاطع بين الحسابات حتى لو تطابق المتصفح.
 * تُستخدم موحدة في: جدول UserDevice، سجل LoginLog، وادعاء dvh في جلسة JWT
 * (حذف سجل الجهاز من صفحة الملف = إبطال جلسته فورًا).
 */
export function deviceFingerprint(userId: string, ua: string | null | undefined): string {
  return createHash("sha256")
    .update(`${userId}-${(ua ?? "unknown-ua").trim()}`)
    .digest("hex");
}

/* ===================== البريد الأمني (Resend REST مباشرة — بلا تبعيات) ===================== */

function securityEmailHtml(input: {
  deviceLabel: string;
  locationLabel: string;
  whenLabel: string;
}): string {
  const { deviceLabel, locationLabel, whenLabel } = input;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#ffffff;border:1px solid #e6eaf1;border-radius:16px;overflow:hidden;">
    <div style="background:#0d1626;padding:24px;text-align:center;">
      <div style="color:#a16a1f;font-size:22px;font-weight:700;">كلام له لازمة</div>
      <div style="color:#e6eaf1;font-size:13px;margin-top:4px;">إشعار أمني لحماية حسابك</div>
    </div>
    <div style="padding:28px 24px;color:#0d1626;line-height:1.9;">
      <p style="margin:0 0 14px;">مرحبًا،</p>
      <p style="margin:0 0 14px;">رصدنا <b>تسجيل دخول جديد لحسابك</b> من جهاز أو موقع لم نعتد رؤيته منك. إن كنت أنت من قام بذلك فلا داعي لأي إجراء — هذه رسالة تعريفية لطمأنتك.</p>
      <table style="width:100%;border-collapse:collapse;background:#f4f6f9;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e6eaf1;font-weight:700;width:35%;">الجهاز</td><td style="padding:10px 14px;border-bottom:1px solid #e6eaf1;">${deviceLabel}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e6eaf1;font-weight:700;">الموقع التقريبي</td><td style="padding:10px 14px;border-bottom:1px solid #e6eaf1;">${locationLabel}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;">التاريخ والوقت</td><td style="padding:10px 14px;">${whenLabel}</td></tr>
      </table>
      <p style="margin:18px 0 6px;"><b>إن لم تكن أنت من سجّل الدخول:</b></p>
      <ul style="margin:0;padding-right:20px;color:#41587a;">
        <li>غيّر كلمة سر حساب Google الخاص بك فورًا من صفحة إعدادات حسابك.</li>
        <li>فعّل التحقق بخطوتين (2-Step Verification) في حساب Google.</li>
        <li>تواصل معنا لتأمين الحساب ومزامنة الهوية من جديد.</li>
      </ul>
    </div>
    <div style="padding:16px 24px;background:#f4f6f9;color:#41587a;font-size:12px;text-align:center;border-top:1px solid #e6eaf1;">
      هذه رسالة أمنية آلية من منصة «كلام له لازمة» — أُرسلت لحظة رصد الدخول حمايةً لحسابك.
    </div>
  </div>
</div>
</body></html>`;
}

/* ===================== التقاط الدخول — النقطة المركزية ===================== */

const DEVICE_LABELS: Record<string, string> = {
  mobile: "هاتف",
  tablet: "جهاز لوحي",
  desktop: "حاسوب",
};

/**
 * توثيق عملية الدخول ومقارنتها بالنشاط المعتاد وإطلاق التنبيه عند الجدة.
 * تُستدعى من أحداث NextAuth — محصّنة كليًا: لا ترمي ولا تعطل الدخول أبدًا.
 */
export async function captureLoginSecurity(input: {
  userId: string;
  email?: string | null;
  userAgent: string | null;
  ip: string | null;
  geoHeaders?: Headers | { get(name: string): string | null };
}): Promise<void> {
  try {
    const ua = parseUserAgent(input.userAgent);
    const hash = deviceFingerprint(input.userId, input.userAgent);

    /* إزالة الازدواج: إن سُجّل نفس الحساب من نفس البصمة خلال آخر 5 دقائق فلا نسخة جديدة */
    const recentCut = new Date(Date.now() - 5 * 60 * 1000);
    const duplicate = await prisma.loginLog.findFirst({
      where: { userId: input.userId, deviceHash: hash, createdAt: { gte: recentCut } },
      select: { id: true },
    });
    if (duplicate) return;

    /* مصدر الحقيقة للجدة: جدول UserDevice الموثوق — هل هذه البصمة
       مسجلة سابقًا لهذا الحساب؟ (السجل القديم LoginLog تاريخ فقط) */
    const knownDevice = await prisma.userDevice.findUnique({
      where: { userId_deviceHash: { userId: input.userId, deviceHash: hash } },
      select: { id: true },
    });
    const isNewDevice = !knownDevice;

    /* الموقع التقريبي — فوري من الترويسات، وخدمة خارجية كاحتياط فقط */
    const geo = isNewDevice ? await resolveGeo(input.ip, input.geoHeaders) : {};
    const locationLabel0 = [geo.city, geo.country].filter(Boolean).join("، ") || null;

    /* توثيق الجهاز في سجل الأجهزة الموثوق:
       جهاز جديد يُنشأ الآن، ومعتاد يُحدَّث آخر نشاطه وآخر عنوان له */
    await prisma.userDevice.upsert({
      where: { userId_deviceHash: { userId: input.userId, deviceHash: hash } },
      create: {
        userId: input.userId,
        deviceHash: hash,
        browser: ua.browser,
        os: ua.os,
        deviceType: ua.deviceType,
        lastIp: input.ip,
        location: locationLabel0,
        lastActiveAt: new Date(),
      },
      update: {
        browser: ua.browser,
        os: ua.os,
        deviceType: ua.deviceType,
        lastIp: input.ip,
        lastActiveAt: new Date(),
      },
    });

    const row = await prisma.loginLog.create({
      data: {
        userId: input.userId,
        email: input.email ?? null,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        deviceType: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        city: geo.city ?? null,
        region: geo.region ?? null,
        country: geo.country ?? null,
        deviceHash: hash,
        isNewDevice,
      },
      select: { id: true, createdAt: true },
    });

    if (!isNewDevice) return; // نشاط معتاد — توثيق صامت بلا إزعاج

    /* ==================== التنبيه الأمني الفوري — عبر المرسل المركزي ==================== */
    const deviceLabel = `${DEVICE_LABELS[ua.deviceType] ?? "جهاز"} — ${ua.browser} على ${ua.os}`;
    const locationLabel = [geo.city, geo.region, geo.country].filter(Boolean).join("، ") || "غير معروف";
    const whenLabel = new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(row.createdAt);
    const title = "إشعار أمان: تسجيل دخول جديد لحسابك";

    /* سجل التدقيق السيادي — SECURITY_NEW_DEVICE_LOGIN (يكتب ويحتسب بلا فشل) */
    await logEvent({
      type: "SECURITY_NEW_DEVICE_LOGIN",
      actorType: "USER",
      actorId: input.userId,
      actorLabel: input.email ?? null,
      message: `دخول من جهاز جديد: ${deviceLabel} — ${locationLabel}`,
      meta: {
        deviceHash: hash,
        ip: input.ip ?? null,
        deviceType: ua.deviceType,
        browser: ua.browser,
        os: ua.os,
        location: locationLabel,
      },
    }).catch(() => {});
    const message = `رصدنا دخولًا من جهاز جديد: ${deviceLabel} — من ${locationLabel} — ${whenLabel}. إن لم تكن أنت، فأمّن حساب Google الخاص بك فورًا.`;

    /* مصفوفة الإرسال: دخول من جهاز جديد = بريد إلكتروني فوري إلزامي + بث ويب + جرس.
       البريد الأمني لا يخضع لتفضيلات القارئ أبدًا (forceEmail + forceInApp). */
    const result = await dispatchNotification({
      userId: input.userId,
      type: "SECURITY_NEW_LOGIN",
      title,
      message,
      link: "/me",
      pushTag: "security-login",
      metadata: { device: deviceLabel, location: locationLabel, ip: input.ip ?? null, when: whenLabel },
      channels: "ALL",
      forceEmail: true,
      forceInApp: true,
      emailHtml: input.email ? securityEmailHtml({ deviceLabel, locationLabel, whenLabel }) : null,
    }).catch(() => ({ inApp: false, pushSent: false, emailSent: false, adminPushed: false }));

    const channels: string[] = [];
    if (result.emailSent) channels.push("email");
    if (result.pushSent) channels.push("push");
    if (result.inApp) channels.push("inapp");

    await prisma.loginLog
      .update({ where: { id: row.id }, data: { notified: true, channels: channels.join(",") } })
      .catch(() => {});
  } catch {
    /* الأمن يراقب ولا يعترض — أي عطل هنا صامت كليًا */
  }
}
