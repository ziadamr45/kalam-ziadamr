import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordServerError } from "@/lib/error-alert";

/**
 * سجل البحث — ذاكرة استعلامات القارئ المسجل فقط:
 *   GET    → آخر استعلامات القارئ (سقف العرض 10)
 *   POST   → تسجيل استعلام { query } — التكرار يرفعه لآخر السجل ولا يكرر السطر
 *            (سقف التخزين 20 لكل قارئ، يُقلَّم آليًا من الأقدم)
 *   DELETE → إزالة استعلام واحد { query } أو مسح السجل كله بلا جسم
 *
 * كل المسارات محصورة بجلسة صحيحة — الزائر غير المسجل يُرد عليه 401
 * والواجهة تتعامل مع ذلك بصمت فلا يظهر له السجل أصلًا.
 */

const MAX_KEEP = 20;
const MAX_SHOW = 10;

/** تنظيف الاستعلام: قصّ الفراغات وتوحيد الأسطر — بلا تخزين خام متناثر */
function cleanQuery(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    const rows = await prisma.searchHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: MAX_SHOW,
      select: { query: true, createdAt: true },
    });
    return NextResponse.json({
      history: rows.map((r) => ({ query: r.query, at: r.createdAt.toISOString() })),
    });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/search/history", method: "GET", requestId: null, url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    const { query } = (await request.json()) as { query?: string };
    const q = cleanQuery(query);
    if (q.length < 2) {
      return NextResponse.json({ error: "استعلام غير صالح" }, { status: 400 });
    }
    await prisma.searchHistory.upsert({
      where: {
        userId_query: { userId: session.user.id, query: q },
      },
      create: { userId: session.user.id, query: q },
      update: { createdAt: new Date() },
    });
    /* التقليم الآلي: لا يملك القارئ أكثر من 20 استعلامًا — الأقدم يُرحَّل تلقائيًا */
    const stale = await prisma.searchHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      skip: MAX_KEEP,
      select: { id: true },
    });
    if (stale.length) {
      await prisma.searchHistory.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/search/history", method: request.method, requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const q = cleanQuery((body as { query?: string } | null)?.query);
    if (q) {
      await prisma.searchHistory.deleteMany({
        where: { userId: session.user.id, query: q },
      });
    } else {
      /* بلا استعلام محدد → مسح السجل كله */
      await prisma.searchHistory.deleteMany({
        where: { userId: session.user.id },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await recordServerError({ err, app: "PUBLIC", path: "/api/search/history", method: "DELETE", requestId: request.headers.get("x-kalam-rid"), url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors` });
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
