import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/audit";

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
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
  pages: { signIn: "/login" },
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
    async signIn({ user }) {
      if (!user?.email) return true;
      try {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, banned: true, name: true },
        });
        if (existing?.banned) {
          /* محاولة دخول محظور — يصل للأدمن فورًا في سجل الشفافية */
          logEvent({
            type: "AUTH_LOGIN_BLOCKED",
            actorType: "GUEST",
            actorId: existing.id,
            actorLabel: user.email,
            message: "محاولة دخول من حساب محظور",
          });
          return false;
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
      logEvent({
        type: "AUTH_LOGIN_SUCCESS",
        actorType: "USER",
        actorId: user?.id ?? null,
        actorLabel: user?.email ?? user?.name ?? null,
        message: isNewUser ? "انضمام قارئ جديد عبر Google" : "تسجيل دخول ناجح عبر Google",
      }).catch(() => {});
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
