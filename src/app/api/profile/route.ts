import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayName, validateCustomName, validateBio } from "@/lib/identity";
import { analyzeComment } from "@/lib/moderation";
import { logEvent, writePublicTrail, getClientIp } from "@/lib/audit";
import { recordServerError } from "@/lib/error-alert";
import { parsePrivileges } from "@/lib/vip";
import { AVATAR_FRAMES, isFrameUnlocked } from "@/lib/avatar-frames";
import { SOCIAL_LINK_KEYS, type VerifiedSocialLinks } from "@/lib/verification-meta";

/**
 * ============================================================
 * مسار تحديث الملف الشخصي — استقلالية الهوية
 * ============================================================
 * PUT: تعديل الاسم المعروض (بفحص فوري للأسماء المسيئة أو الفارغة)
 * والصورة الشخصية (رابط Cloudinary من /api/upload) والنبذة الفكرية وإطار الصورة.
 * إرسال أي حقل قيمته null يُرجعه لحالة Google الأصلية بنقرة واحدة.
 * بيانات Google الأصلية (email/googleId/name/image) لا تُمس إطلاقًا.
 */

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = (await request.json()) as {
      customName?: string | null;
      customImage?: string | null;
      avatarFrame?: string | null;
      bio?: string | null;
      extendedBio?: string | null;
      verifiedSocialLinks?: VerifiedSocialLinks | null;
      notificationPrefs?: { pushNewArticles?: boolean; impactAndReplies?: boolean } | null;
    };

    const data: {
      customName?: string | null;
      customImage?: string | null;
      avatarFrame?: string | null;
      bio?: string | null;
      extendedBio?: string | null;
      verifiedSocialLinks?: VerifiedSocialLinks | null;
      notificationPrefs?: { pushNewArticles?: boolean; impactAndReplies?: boolean } | null;
    } = {};

    /* ==================== الاسم المعروض ==================== */
    if (body.customName !== undefined) {
      if (body.customName === null || body.customName.trim() === "") {
        data.customName = null; // استرجاع اسم Google الأصلي
      } else {
        const invalid = validateCustomName(body.customName);
        if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

        /* الفلترة الأخلاقية نفسها المعتمدة للتعليقات — تحجب الأسماء المسيئة */
        const verdict = analyzeComment(body.customName);
        if (verdict.status === "REJECT") {
          return NextResponse.json(
            { error: "هذا الاسم يخالف أدب المنصة — اختر اسمًا لائقًا بهويتك" },
            { status: 400 },
          );
        }
        data.customName = body.customName.trim();
      }
    }

    /* ==================== الصورة الشخصية ==================== */
    if (body.customImage !== undefined) {
      if (body.customImage === null || body.customImage.trim() === "") {
        data.customImage = null; // استرجاع صورة Google الأصلية بنقرة واحدة
      } else {
        const img = body.customImage.trim();
        if (!/^https:\/\//.test(img) || img.length > 500) {
          return NextResponse.json({ error: "رابط صورة غير صالح" }, { status: 400 });
        }
        let imgHost = "";
        try {
          imgHost = new URL(img).hostname.toLowerCase();
        } catch {
          return NextResponse.json({ error: "رابط صورة غير صالح" }, { status: 400 });
        }
        const allowedHosts = ["res.cloudinary.com", "lh3.googleusercontent.com"];
        if (!allowedHosts.includes(imgHost)) {
          return NextResponse.json(
            { error: "صورة الملف الشخصي تُقبل من رفع المنصة أو صورة Google فقط" },
            { status: 400 },
          );
        }
        if (imgHost === "res.cloudinary.com") {
          const cloud = process.env.CLOUDINARY_CLOUD_NAME;
          if (cloud && !img.includes(`/${cloud}/`)) {
            return NextResponse.json({ error: "رابط الصورة ليس من سحابة المنصة" }, { status: 400 });
          }
        }
        data.customImage = img;
      }
    }

    /* ==================== إطار الصورة الشخصية ==================== */
    if (body.avatarFrame !== undefined) {
      if (body.avatarFrame === null || body.avatarFrame === "" || body.avatarFrame === "none") {
        data.avatarFrame = null;
      } else {
        const valid = AVATAR_FRAMES.some((f) => f.id === body.avatarFrame);
        if (!valid) {
          return NextResponse.json({ error: "إطار غير معروف" }, { status: 400 });
        }
        const currentUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { impactScore: true, isVerified: true, isVip: true },
        });
        if (!currentUser || !isFrameUnlocked(body.avatarFrame, currentUser)) {
          return NextResponse.json({ error: "هذا الإطار لم يُفتح بعد لرتبتك الحالية" }, { status: 403 });
        }
        data.avatarFrame = body.avatarFrame;
      }
    }

    /* ==================== النبذة الفكرية ==================== */
    if (body.bio !== undefined) {
      if (body.bio === null || body.bio.trim() === "") {
        data.bio = null;
      } else {
        const invalid = validateBio(body.bio);
        if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
        data.bio = body.bio.trim();
      }
    }

    /* ==================== النبذة الموسعة (البطاقة الغنية لحاملي التوثيق) ==================== */
    if (body.extendedBio !== undefined) {
      if (body.extendedBio === null || body.extendedBio.trim() === "") {
        data.extendedBio = null;
      } else {
        const text = body.extendedBio.trim();
        if (text.length < 10) {
          return NextResponse.json({ error: "النبذة الموسعة 10 أحرف فأكثر — اكتب عن اهتماماتك الفكرية" }, { status: 400 });
        }
        if (text.length > 1200) {
          return NextResponse.json({ error: "النبذة الموسعة حتى 1200 حرف" }, { status: 400 });
        }
        const verdict = analyzeComment(text);
        if (verdict.status === "REJECT") {
          return NextResponse.json({ error: "النبذة تخالف أدب المنصة — راجع صياغتها" }, { status: 400 });
        }
        data.extendedBio = text;
      }
    }

    /* ==================== تفضيلات الإشعارات ==================== */
    if (body.notificationPrefs !== undefined) {
      const raw = body.notificationPrefs;
      if (raw === null) {
        data.notificationPrefs = null;
      } else {
        data.notificationPrefs = {
          pushNewArticles: raw.pushNewArticles !== false,
          impactAndReplies: raw.impactAndReplies !== false,
        };
      }
    }

    /* ==================== الروابط الشخصية (المفاتيح المعتمدة فقط) ==================== */
    if (body.verifiedSocialLinks !== undefined) {
      if (body.verifiedSocialLinks === null) {
        data.verifiedSocialLinks = null;
      } else {
        const clean: VerifiedSocialLinks = {};
        for (const key of SOCIAL_LINK_KEYS) {
          const v = (body.verifiedSocialLinks as Record<string, unknown>)[key];
          if (typeof v !== "string" || !v.trim()) continue;
          const url = v.trim();
          if (!/^https:\/\/[^\s]{4,300}$/i.test(url)) {
            return NextResponse.json(
              { error: `رابط غير صالح في «${key}» — يُقبل رابط https كامل فقط` },
              { status: 400 },
            );
          }
          clean[key] = url;
        }
        data.verifiedSocialLinks = Object.keys(clean).length > 0 ? clean : null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا تغييرات للحفظ" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: data as never,
      select: {
        customName: true,
        customImage: true,
        avatarFrame: true,
        bio: true,
        extendedBio: true,
        verifiedSocialLinks: true,
        notificationPrefs: true,
      },
    });

    writePublicTrail({
      actorId: userId,
      actorEmail: session.user.email ?? userId,
      actionType: "PROFILE_UPDATED",
      description: "تحديث الهوية المعروضة للقارئ من الموقع العام (الاسم/الصورة/النبذة/الإطار)",
      metadata: { ip: getClientIp(request) },
    });
    logEvent({
      type: "PROFILE_UPDATED",
      actorType: "USER",
      actorId: userId,
      actorLabel: session.user.email ?? null,
      message: "حدّث القارئ هويته المعروضة",
      meta: {
        nameChanged: "customName" in data,
        imageChanged: "customImage" in data,
        frameChanged: "avatarFrame" in data,
        bioChanged: "bio" in data,
        displayName: displayName(updated),
      },
      ip: getClientIp(request),
    }).catch(() => {});

    return NextResponse.json({ ok: true, profile: updated });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/profile", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "تعذر حفظ التغييرات — أعد المحاولة" }, { status: 500 });
  }
}

/** حالة القارئ الحية للواجهات — الهوية + التوثيق والصلاحيات الممنوحة */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ loggedIn: false });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      image: true,
      customName: true,
      customImage: true,
      avatarFrame: true,
      bio: true,
      impactScore: true,
      intellectualRank: true,
      isVerified: true,
      verificationType: true,
      verificationLabel: true,
      isVip: true,
      vipBadgeTitle: true,
      vipBadgeColor: true,
      vipPrivileges: true,
      role: true,
    },
  });
  if (!user) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });

  const privileges = parsePrivileges(user.vipPrivileges);
  return NextResponse.json({
    loggedIn: true,
    profile: user,
    isVerified: user.isVerified,
    verificationType: user.verificationType,
    verificationLabel: user.verificationLabel,
    isVip: user.isVip,
    badgeTitle: user.vipBadgeTitle,
    badgeColor: user.vipBadgeColor,
    role: user.role,
    canSelfPin: privileges.selfPinComment === true,
    betaFeatures: privileges.betaFeatures === true,
  });
}
