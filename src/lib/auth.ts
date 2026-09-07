import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";

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
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return true;
      try {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          select: { banned: true },
        });
        if (existing?.banned) return false;
      } catch {
        // عند فشل الاتصال لا نمنع الدخول — الحماية تُطبق عند التعليق
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = String(token.uid);
      }
      return session;
    },
  },
});
