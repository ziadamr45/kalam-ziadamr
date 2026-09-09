import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { dispatchAdminEvent } from "@/lib/notifications/dispatcher";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { captureLoginSecurity } from "@/lib/security-notify";
import { ensureOwnerSovereign } from "@/lib/vip";

/**
 * هل مُهِّئت مفاتيح Google الحقيقية؟
 * القيم المؤقتة المحقونة قبل تسليم المفاتيح تبدأ بـ PLACEHOLDER —
 * في هذه الحالة يُخفى زر الدخول بجوجل من الواجهة بدل إظهار زر معطوب.
 */
export const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_ID.startsWith("PLACEHOLDER") &&
    !process.env.GOOGLE_CLIENT_SECRET.startsWith("PLACEHOLDER"),
);

/**
 * ضبط الكوكيز ديناميكيًا وفق البيئة:
 * - في Vercel Production (HTTPS) تُستخدم كوكيز Secure باسم __Secure-.
 * - هذا يحل رفض المتصفحات على الهواتف لكوكيز الجلسة عند الارتداد
 *   من خوادم Google عبر شبكات المحمول، ويحافظ على sameSite=lax الآمن.
 */
const useSecureCookies =
  process.env.NEXTAUTH_URL?.startsWith("https://") ||
  process.env.AUTH_URL?.startsWith("https://") ||
  (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === "production";

const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  /* سرّ التوقيع صريحًا — يغطي التسميتين (Auth.js v5 يقرأ AUTH_SECRET أولًا،
     ووجوده هنا يمنع خطأ MissingSecret الذي يولّد الشاشة الرمادية
     «There is a problem with the server configuration» في الإنتاج */
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          /* استراتيجية السيادة: ربط الحسابات بالبريد صريحًا —
             أي دخول Google ببريد مطابق لحساب قائم يرتبط به فورًا
             حتى من جهاز جديد تمامًا، فلا يُنشأ حساب مكرر ولا يُرمى
             OAuthAccountNotLinked الذي يولّد شاشة الخطأ السوداء */
          allowDangerousEmailAccountLinking: true,
          authorization: {
            params: {
              prompt: "select_account",
              access_type: "offline",
            },
          },
        }),
      ]
    : [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  /* بوابة الوصول المخصصة: كل مسار — دخول أو خطأ — يهبط في صفحتنا الراقية
     /auth/login برسائل ودية، فلا تظهر أبدًا شاشة Auth.js السوداء الافتراضية */
  pages: { signIn: "/auth/login", error: "/auth/login" },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    state: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900,
      },
    },
    nonce: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    /*
     * حارس إعادة التوجيه — قلب إصلاح الشاشة الرمادية بعد العودة من Google:
     * أي رابط داخلي يُلحق بـ baseUrl كما هو، وأي رابط خارجي
     * يطابق نطاق الإنتاج يُمرَّر، وما عدا ذلك يعود آمنًا إلى baseUrl —
     * بلا أي استثناء غير معالج في دورة الـ Callback.
     */
    redirect({ url, baseUrl }) {
      const base = baseUrl.replace(/\/+$/, "");
      try {
        if (url.startsWith("/")) return `${base}${url}`;
        const parsed = new URL(url);
        if (parsed.origin === base) return url;
        /* نطاق غريب — يُقتطع إلى الرئيسية بدل رمي خطأ */
        return base;
      } catch {
        /* رابط مشوّه — عودة آمنة بدل انهيار الدورة */
        return base;
      }
    },
    async signIn({ user, account }) {
      if (!user?.email) return true;
      try {
        const email = user.email.toLowerCase().trim();
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, banned: true },
        });
        if (existing?.banned) {
          /* محاولة دخول محظور — يصل للأدمن فورًا في سجل الشفافية */
          logEvent({
            type: "AUTH_LOGIN_BLOCKED",
            actorType: "GUEST",
            actorId: existing.id,
            actorLabel: email,
            message: "محاولة دخول من حساب محظور",
          });
          return false;
        }

        /* الربط الصريح بالبريد — شبكة أمان إضافية فوق
           allowDangerousEmailAccountLinking: إن عُرف الحساب بالبريد
           وصف الربط لم يُكتب لأي سبب، نكتبه هنا بأنفسنا */
        if (existing && account?.provider && account?.providerAccountId) {
          const hasLink = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            select: { userId: true },
          });
          if (!hasLink && user.id && user.id === existing.id) {
            await prisma.account
              .create({
                data: {
                  userId: existing.id,
                  type: account.type ?? "oauth",
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  refresh_token: account.refresh_token ?? null,
                  access_token: account.access_token ?? null,
                  expires_at: account.expires_at ?? null,
                  token_type: account.token_type ?? null,
                  scope: account.scope ?? null,
                  id_token: account.id_token ?? null,
                },
              })
              .catch(() => {}); // سباق بلا ضرر — الربط كُتب بالتوازي
          }
        }
        return true;
      } catch {
        // عند فشل الاتصال لا نمنع الدخول — الحماية تُطبق عند التعليق
        return true;
      }
    },
    jwt({ token, user }) {
      try {
        if (user?.id) token.uid = user.id;
        /* إذا ضاع الـ uid من الكوكي لأي سبب نستعيده من الحساب المربوط */
        if (!token.uid && token.email) {
          // لا استعلام هنا — يُستكمل في session (استعلام أرخص مرة واحدة)
        }
      } catch {
        // لا نرمي أبدًا — نعيد الكوكي كما هو بدل انهيار الخادم
      }
      return token;
    },
    async session({ session, token }) {
      try {
        if (session.user && token.uid) {
          session.user.id = String(token.uid);
          /* الهوية المعروضة حيًا من قاعدة البيانات:
             الاسم المخصص والصورة الشخصية أولًا ثم بيانات Google الأصلية —
             فيتكيف الهيدر والقوائم فور أي تعديل من صفحة الملف الشخصي */
          const dbUser = await prisma.user.findUnique({
            where: { id: String(token.uid) },
            select: { image: true, name: true, customName: true, customImage: true },
          });
          if (dbUser) {
            session.user.image = dbUser.customImage?.trim() || dbUser.image || null;
            session.user.name = dbUser.customName?.trim() || dbUser.name || null;
          }
        }
      } catch {
        // جلسة ناقصة الهوية أفضل من انهيار
      }
      return session;
    },
  },
  events: {
    /* كل دخول وخروج Google يُسجل في سجلات الشفافية للوحة التحكم */
    async signIn({ user, isNewUser }) {
      /* البذر السيادي لحساب صاحب المنصة — عند كل دخول له يُفحص ويُكمل
         ما نقص من رتبة/توثيق/شارة/رصيد سيادي/صلاحيات كاملة (idempotent) */
      void ensureOwnerSovereign(user?.email).catch(() => {});

      logEvent({
        type: "AUTH_LOGIN_SUCCESS",
        actorType: "USER",
        actorId: user?.id ?? null,
        actorLabel: user?.email ?? user?.name ?? null,
        message: isNewUser ? "انضمام قارئ جديد عبر Google" : "تسجيل دخول ناجح عبر Google",
      }).catch(() => {});

      /* حدث سيادة: قارئ جديد انضم — جرس لوحة الأدمن + رنين هواتف الإدارة */
      if (isNewUser && user?.id) {
        void dispatchAdminEvent({
          type: "ADMIN_NEW_USER",
          title: "قارئ جديد انضم إلى المنصة",
          message: `${user.name ?? "عضو جديد"} (${user.email ?? "بلا بريد"}) — أهلًا به ضمن مجتمع الفكر والأثر`,
          link: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/users`,
          pushTag: "new-user",
          metadata: { userId: user.id, email: user.email ?? null },
        }).catch(() => {});
      }

      /* الميثاق الأمني السيادي: التقاط الدخول (IP + الجهاز + الموقع التقريبي)
         ومقارنته بالنشاط المعتاد، وإطلاق التنبيه الفوري عند جهاز جديد —
         محصّن بحد زمني 6 ثوانٍ ولا يعطل تسجيل الدخول أبدًا مهما حدث */
      if (user?.id) {
        try {
          const h = await headers();
          await Promise.race([
            captureLoginSecurity({
              userId: user.id,
              email: user.email ?? null,
              userAgent: h.get("user-agent"),
              ip:
                h.get("x-real-ip") ||
                h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                null,
              geoHeaders: h,
            }),
            new Promise((resolve) => setTimeout(resolve, 6000)),
          ]);
        } catch {
          /* التقاط الأمن لا يُفشل الدخول قط */
        }
      }
    },
    async signOut(message) {
      const token = (message as { token?: { uid?: string; email?: string } })?.token;
      logEvent({
        type: "AUTH_SIGNOUT",
        actorType: "USER",
        actorId: token?.uid ? String(token.uid) : null,
        actorLabel: token?.email ?? null,
        message: "تسجيل خروج",
      }).catch(() => {});
    },
  },
});
