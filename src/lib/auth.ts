import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
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
