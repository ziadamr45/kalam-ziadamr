import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * ختم تجربة التهيئة والجولة التفاعلية:
 * GET — هل يحتاج هذا العضو تجربة التهيئة؟ (فحص حقل قاعدة البيانات الحي)
 * POST — ختم التجربة مكتملة (إكمالًا أو تخطيًا) فلا تتكرر أبدًا.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ needed: false });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hasCompletedOnboarding: true, banned: true },
  });
  return NextResponse.json({ needed: Boolean(user && !user.banned && !user.hasCompletedOnboarding) });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { hasCompletedOnboarding: true },
  });
  return NextResponse.json({ ok: true });
}
