import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import {
  VERIFICATION_TYPES,
  VERIFICATION_TYPE_META,
  verificationMeta,
  verificationSealLabel,
  type VerificationType,
} from "@/lib/verification-meta";

export {
  VERIFICATION_TYPES,
  VERIFICATION_TYPE_META,
  verificationMeta,
  verificationSealLabel,
} from "@/lib/verification-meta";
export type { VerificationType } from "@/lib/verification-meta";

/**
 * ============================================================
 * منظومة التوثيق السيادي والحسابات المميزة — VIP & Verification Engine
 * ============================================================
 * الحبات المركزية التي تخدمها كل الواجهات:
 * 1) البذر السيادي التلقائي لحساب صاحب المنصة (Owner Sovereign Seeding)
 *    — يُنفَّذ عند كل تسجيل دخول للمالك وعند إقلاع خادم اللوحة، وهو
 *    idempotent بالكامل: لا يُخفض رصيدًا ولا يعيد منحًا منجزًا.
 * 2) مفاتيح الصلاحيات الموحدة (Privilege Keys) — قاموس واحد تقرأه
 *    بوابات الذكاء الاصطناعي والتعليقات والمقترحات والواجهات كلها.
 * 3) مذيّع إشعارات التوثيق (VIP Notification Dispatcher) — جرس داخلي
 *    + بث ويب فوري لهاتف المستخدم + بريد Resend مصمم + توثيق AuditEvent
 *    حي يظهر في مركز نشاط الأدمن فورًا.
 *
 * قاعدة صارمة: كل المنح تمر من هنا — لا طريق جانبية ولا قيم متفرقة.
 */

/** بريد صاحب المنصة — الحساب السيادي الأسمى، لا يُمنح لغيره مطلقًا */
export const OWNER_EMAIL = "ziad90216@gmail.com";

/** رصيد الأثر السيادي — أعلى رصيد في المنصة، يفتح كل القنوات للأبد */
export const SOVEREIGN_IMPACT = 9999;

/** اللون الذهبي الفاخر المعتمد لشارة المؤسس */
export const SOVEREIGN_COLOR = "#D97706";

/* ==================== مفاتيح الصلاحيات (Privilege Keys) ==================== */

export type VipPrivileges = {
  /** حصة ذكاء اصطناعي غير محدودة في «ناقش المقال» */
  unlimitedAiChat?: boolean;
  /** تجاوز كل محددات المعدل وفترات التهدئة (تعليقات/تصويتات) */
  bypassRateLimits?: boolean;
  bypassCooldowns?: boolean;
  /** الدخول الفوري لقناة «أهل الكلمة» بغض النظر عن الرصيد */
  ahlAlKalimaAccess?: boolean;
  /** تثبيت تعليقه الشخصي أعلى التعليقات في أي مقال */
  selfPinComment?: boolean;
  /** إطار تعليق فخم بلون الشارة في كافة المقالات */
  vipCommentBorder?: boolean;
  /** وصول مبكر للميزات التجريبية */
  betaFeatures?: boolean;
};

/** كل المفاتيح مفعّلة 100% — المنحى السيادي وحده */
export const ALL_PRIVILEGES: VipPrivileges = {
  unlimitedAiChat: true,
  bypassRateLimits: true,
  bypassCooldowns: true,
  ahlAlKalimaAccess: true,
  selfPinComment: true,
  vipCommentBorder: true,
  betaFeatures: true,
};

/** قاموس الصلاحيات للعرض — الاستوديو والتيرمينال وMCP يقرؤون منه */
export const PRIVILEGE_LABELS: Record<keyof VipPrivileges, string> = {
  unlimitedAiChat: "حصة ذكاء اصطناعي غير محدودة",
  bypassRateLimits: "تجاوز محددات المعدل",
  bypassCooldowns: "تجاوز فترات التهدئة",
  ahlAlKalimaAccess: "قناة «أهل الكلمة» فورية",
  selfPinComment: "تثبيت تعليقاته ذاتيًا",
  vipCommentBorder: "إطار تعليق فخم بلون الشارة",
  betaFeatures: "وصول مبكر للميزات التجريبية",
};

export const PRIVILEGE_KEYS = Object.keys(PRIVILEGE_LABELS) as (keyof VipPrivileges)[];

/** تقييم كائن Json الخام إلى مفاتيح موثوقة — لا يثق إلا بالمفاتيح المعروفة */
export function parsePrivileges(raw: unknown): VipPrivileges {
  if (!raw || typeof raw !== "object") return {};
  const out: VipPrivileges = {};
  for (const key of PRIVILEGE_KEYS) {
    if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
  }
  return out;
}

/** فحص صلاحية واحدة من صف مستخدم خام (Json) — آمن ضد القيم الناقصة */
export function hasPrivilege(rawVipPrivileges: unknown, key: keyof VipPrivileges): boolean {
  return parsePrivileges(rawVipPrivileges)[key] === true;
}

/** فحص صلاحية مستخدم بالمعرف — استعلام خفيف لبوابات الخادم (AI/تعليقات/مقترحات) */
export async function userHasPrivilege(userId: string, key: keyof VipPrivileges): Promise<boolean> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { vipPrivileges: true },
    });
    return hasPrivilege(u?.vipPrivileges, key);
  } catch {
    return false;
  }
}

/* ==================== تصنيفات التوثيق الرسمي وألوانها ====================
 * الفصل المعماري: التوثيق (إثبات هوية) ≠ العضوية المميزة (امتيازات).
 * التصنيفات الأربعة وألوان الأختام في verification-meta.ts — تُعاد
 * تصديرها هنا لتوحيد مصدر الحقيقة لكل الواجهات. */

/** لوحة الألوان الجاهزة في الاستوديو — ألوان فاخرة معتمدة */
export const BADGE_COLOR_PRESETS = [
  { hex: "#D97706", name: "ذهبي سيادي" },
  { hex: "#2563EB", name: "أزرق ملكي" },
  { hex: "#059669", name: "زمردي" },
  { hex: "#1E3A8A", name: "كحلي رصين" },
  { hex: "#6B8E23", name: "زيتي شرفي" },
  { hex: "#7C3AED", name: "بنفسجي فاخر" },
  { hex: "#E11D48", name: "قرمزي" },
  { hex: "#0D9488", name: "فيروزي" },
];

/** تحقق من صياغة لون سداسي سليم — يحمي الواجهات من قيم فاسدة */
export function isValidHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/* ==================== البذر السيادي لحساب المالك ==================== */

export type SovereignSeedResult = {
  seeded: boolean; // هل جرى تغيير فعلي في هذه النداءة؟
  reason: "CREATED" | "UPGRADED" | "ALREADY_SOVEREIGN" | "NO_EMAIL";
};

/**
 * ضمان أن حساب المالك سيادي كامل الصلاحيات — يُستدعى عند كل دخول
 * له وعند إقلاع خادم اللوحة. آمن للاستدعاء المتكرر (idempotent):
 * يفحص أولاً ويكتب فقط ما نقص، ولا يُخفض رصيدًا قائمًا أبدًا.
 */
export async function ensureOwnerSovereign(email?: string | null): Promise<SovereignSeedResult> {
  if (!email || email.toLowerCase() !== OWNER_EMAIL) return { seeded: false, reason: "NO_EMAIL" };
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { seeded: false, reason: "NO_EMAIL" };

    /* مكتمل أصلًا؟ — لا كتابة إطلاقًا (مسار الأغلبية الساحقة) */
    const fullySovereign =
      user.role === "OWNER" &&
      user.isVerified &&
      user.verificationType === "OWNER" &&
      user.isVip === true &&
      user.vipBadgeTitle === "مؤسس المنصة" &&
      user.vipBadgeColor === SOVEREIGN_COLOR &&
      user.impactScore >= SOVEREIGN_IMPACT &&
      hasPrivilege(user.vipPrivileges, "unlimitedAiChat") &&
      hasPrivilege(user.vipPrivileges, "selfPinComment");
    if (fullySovereign) return { seeded: false, reason: "ALREADY_SOVEREIGN" };

    const privileges = { ...ALL_PRIVILEGES };
    const data = {
      role: "OWNER" as const,
      banned: false,
      banReason: null,
      /* التوثيق الرسمي: مؤسس — إثبات هوية ذهبي */
      isVerified: true,
      verificationType: "OWNER" as const,
      verifiedAt: user.verifiedAt ?? new Date(),
      verificationLabel: user.verificationLabel ?? "مؤسس المنصة",
      /* العضوية المميزة المستقلة: شارة المؤسس الذهبية + كل الصلاحيات */
      isVip: true,
      vipBadgeTitle: "مؤسس المنصة",
      vipBadgeColor: SOVEREIGN_COLOR,
      vipReason: user.vipReason ?? "صاحب المنصة السيادي — الحساب الأسمى",
      vipGrantedAt: user.vipGrantedAt ?? new Date(),
      vipPrivileges: privileges as never,
    };

    await prisma.user.update({ where: { id: user.id }, data });

    /* الرصيد السيادي — لا يُخفض أبدًا: لو رصيده أعلى يبقى كما هو */
    if (user.impactScore < SOVEREIGN_IMPACT) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { impactScore: SOVEREIGN_IMPACT, intellectualRank: "أهل الكلمة" },
        }),
        prisma.impactLog.create({
          data: {
            userId: user.id,
            actionType: "CALIBRATION",
            points: SOVEREIGN_IMPACT - user.impactScore,
            reason: "الرصيد السيادي لحساب صاحب المنصة — فتح دائم لكل القنوات",
            dedupKey: `SOV:${user.id}`,
          },
        }),
      ]).catch(async () => {
        /* dedupKey موجود مسبقًا — الرصيد ممنوح سابقًا، نُحدّث الرصيد فقط */
        await prisma.user
          .update({ where: { id: user.id }, data: { impactScore: SOVEREIGN_IMPACT, intellectualRank: "أهل الكلمة" } })
          .catch(() => {});
      });
    }

    /* توثيق حي في سجل الأحداث عند أول ترقية فقط */
    if (!user.isVerified) {
      const { logEvent } = await import("@/lib/audit");
      void logEvent({
        type: "USER_VERIFIED",
        actorType: "SYSTEM",
        actorId: user.id,
        actorLabel: user.email ?? undefined,
        message: "البذر السيادي: تُوّثق حساب صاحب المنصة تلقائيًا (توثيق مؤسس ذهبي + عضوية مميزة)",
        meta: { verificationType: "OWNER", isVip: true, badge: "مؤسس المنصة" },
      });
    }

    return { seeded: true, reason: user.impactScore === 0 ? "CREATED" : "UPGRADED" };
  } catch {
    /* البذر زينة لا يعطل دخول المالك أبدًا */
    return { seeded: false, reason: "NO_EMAIL" };
  }
}

/* ==================== مذيّع إشعارات التوثيق ==================== */

export type VipDispatchEvent =
  | "GRANTED"
  | "MODIFIED"
  | "REVOKED"
  | "ELITE"
  | "VERIFIED"
  | "UNVERIFIED";

export type VipDispatchInput = {
  event: VipDispatchEvent;
  userId: string;
  /** مسمى الشارة الحالي (بعد التعديل) — يُعرض في النص والبريد */
  badgeTitle?: string | null;
  badgeColor?: string | null;
  /** سبب الإدارة الإلزامي */
  reason?: string | null;
  /** الرتبة الجديدة إن غيّرت */
  roleLabel?: string | null;
};

function notificationCopy(input: VipDispatchInput): { title: string; body: string } {
  const badge = input.badgeTitle || "حساب موثّق";
  switch (input.event) {
    case "GRANTED":
      return {
        title: `تهانينا! حصلت على شارة «${badge}» ✦`,
        body: `تم منح حسابك رتبة${input.roleLabel ? ` «${input.roleLabel}»` : ""} وشارة «${badge}»${
          input.badgeColor ? " بلون مميز" : ""
        }. السبب: ${input.reason ?? "تمييز إداري"}. تفقد مزاياك الفكرية الجديدة في ملفك الشخصي.`,
      };
    case "ELITE":
      return {
        title: "لقد بلغت عتبة 350 نقطة أثر! ✦",
        body: "تم توثيق حسابك رسميًا كعضو في «أهل الكلمة»، وبات بإمكانك الآن طرح ومناقشة مقترحات المقالات مباشرة مع الإدارة.",
      };
    case "MODIFIED":
      return {
        title: "تم تحديث مزايا حسابك الموثّق",
        body: `حالة توثيق حسابك: «${badge}». السبب: ${input.reason ?? "تحديث إداري"}.`,
      };
    case "REVOKED":
      return {
        title: "تم تحديث حالة توثيق حسابك",
        body: `سُحبت الشارة «${badge}». السبب: ${input.reason ?? "قرار إداري"}. شكرًا لمشاركتك، ويمكنك استعادة التمييز بالتفاعل الرصين.`,
      };
    case "VERIFIED": {
      const sealLabel = input.badgeTitle || "حساب موثّق";
      return {
        title: `علامة التوثيق الرسمية صارت لك ✓`,
        body: `وُثّق حسابك رسميًا كـ«${sealLabel}»${input.reason ? ` — السبب: ${input.reason}` : ""}. علامة التوثيق تظهر الآن بجانب اسمك في كل النقاشات، وتعليقاتك في مقدمة الحوار، وبلا فترات تهدئة.`,
      };
    }
    case "UNVERIFIED":
      return {
        title: "تم تحديث حالة التوثيق لحسابك",
        body: `سُحبت علامة التوثيق الرسمية${input.badgeTitle ? ` («${input.badgeTitle}»)` : ""}. السبب: ${input.reason ?? "قرار إداري"}. عضويتك المميزة إن وُجدت لا تُمس بهذا الإجراء.`,
      };
  }
}

/** قالب البريد الفاخر — بسيط ونظيف يعمل في كل عملاء البريد */
function vipEmailHtml(input: VipDispatchInput, name: string | null): string {
  const { title, body } = notificationCopy(input);
  const badge = input.badgeTitle || "حساب موثّق";
  const color = isValidHexColor(input.badgeColor) ? input.badgeColor : "#D97706";
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#faf9f7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding:28px 24px;background:#ffffff;border-radius:16px;border:1px solid #eee7dd;">
      <p style="margin:0 0 6px;font-size:13px;color:#8a8378;letter-spacing:.5px;">كلام له لازمة</p>
      <h1 style="margin:0 0 18px;font-size:22px;color:#1c1917;">${title}</h1>
      <div style="display:inline-block;padding:8px 22px;border-radius:999px;background:${color};color:#fff;font-size:14px;font-weight:700;margin-bottom:18px;">${badge}</div>
      <p style="margin:0;font-size:15px;line-height:2;color:#44403c;">${body}</p>
      <p style="margin:22px 0 0;font-size:12px;color:#a8a29e;">${name ? `أهلاً ${name} — ` : ""}هذه رسالة نظامية من منظومة التوثيق، لا تحتاج ردًا.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#a8a29e;margin:16px 0 0;">نُشر بعناية.. لكلام له لازمة.</p>
  </div></body></html>`;
}

/**
 * إطلاق حزمة الإشعارات الكاملة لحدث توثيق/تمييز:
 * جرس داخلي (UserNotification) → بث ويب فوري (Push) → بريد Resend
 * → توثيق AuditEvent (USER_VERIFIED / NOTIFICATION_DISPATCHED_VIP)
 * كل طبقة معزولة بـ catch خاص — فشل بريد لا يُسقط إشعارًا، والعكس.
 */
export async function dispatchVipNotification(input: VipDispatchInput): Promise<{
  inApp: boolean;
  pushSent: boolean;
  emailSent: boolean;
}> {
  const { title, body } = notificationCopy(input);
  const user = await prisma.user
    .findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, customName: true, name: true },
    })
    .catch(() => null);
  if (!user) return { inApp: false, pushSent: false, emailSent: false };

  /* خريطة الأحداث إلى أنواع الإشعار الموحدة وقنواتها وفق مصفوفة الإرسال:
     ترقية مميزة/توثيق/نخبة 350 = كل القنوات (جرس + بث + بريد)،
     والتعديل والسحب وإلغاء التوثيق = داخل الموقع فقط */
  const type =
    input.event === "REVOKED"
      ? "VIP_REVOKED"
      : input.event === "VERIFIED" || input.event === "UNVERIFIED" || input.event === "ELITE"
        ? "USER_VERIFIED"
        : "VIP_UPGRADE_GRANTED";
  const channels =
    input.event === "MODIFIED" || input.event === "UNVERIFIED" || input.event === "REVOKED"
      ? ("IN_APP" as const)
      : ("ALL" as const);

  const result = await dispatchNotification({
    userId: user.id,
    type,
    title,
    message: body,
    link: "/profile",
    pushTag: `vip-${input.event.toLowerCase()}`,
    metadata: {
      event: input.event,
      badge: input.badgeTitle ?? null,
      color: input.badgeColor ?? null,
      reason: input.reason ?? null,
    },
    channels,
    forceInApp: true,
    emailHtml: vipEmailHtml(input, user.customName ?? user.name),
  }).catch(() => ({ inApp: false, pushSent: false, emailSent: false, adminPushed: false }));

  return { inApp: result.inApp, pushSent: result.pushSent, emailSent: result.emailSent };
}

/** التسمية العربية للرتب — تُعرض في الإشعارات والاستوديو */
export function roleLabelAr(role: string | null | undefined): string {
  switch (role) {
    case "OWNER":
      return "صاحب المنصة";
    case "ADMIN":
      return "مدير نظام";
    case "EDITOR":
      return "كاتب محتوى";
    case "MODERATOR":
      return "مشرف محتوى";
    default:
      return "مستخدم عادي";
  }
}
