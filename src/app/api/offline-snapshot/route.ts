import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * لقطة المقال للقراءة دون اتصال — تُستعمل من صفحة «قراءاتي المحفوظة»
 * لتنزيل مقال محفوظ في الحساب (سحابيًا) إلى ذاكرة هذا الجهاز (IndexedDB).
 * بيانات مقال منشور — عامة بطبيعتها كما في صفحة قراءته.
 * GET /api/offline-snapshot?id=<articleId>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  try {
    const a = await prisma.article.findFirst({
      where: { id, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        contentWithTashkeel: true,
        readingTimeSec: true,
        audioUrl: true,
        section: { select: { name: true, slug: true } },
      },
    });
    if (!a) {
      return NextResponse.json({ error: "المقال غير متاح" }, { status: 404 });
    }
    return NextResponse.json({
      snapshot: {
        id: a.id,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        content: a.content,
        contentWithTashkeel: a.contentWithTashkeel ?? "",
        readingTimeSec: a.readingTimeSec,
        audioUrl: a.audioUrl,
        sectionName: a.section?.name ?? null,
        sectionSlug: a.section?.slug ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
