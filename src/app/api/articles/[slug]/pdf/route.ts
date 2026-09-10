import { NextResponse } from "next/server";
import QRCode from "qrcode";
import sharp from "sharp";
import { getArticleBySlug, safeDecodeSlug } from "@/lib/db-queries";
import { renderArticlePdf } from "@/lib/article-pdf";
import { recordServerError } from "@/lib/error-alert";

/**
 * ============================================================
 * تصدير المقال PDF — النسخة التحريرية الرسمية الصالحة للطباعة
 * ============================================================
 * GET /api/articles/[slug]/pdf
 *
 * يولّد وثيقة A4 طباعية نقية عبر محرك @react-pdf/renderer:
 * ترويسة رسمية بشعار المنصة والتصنيف والتاريخ وخط ذهبي فاصل،
 * غلاف بأبعاد متناسقة، عنوان أميري فخم، رمز QR للنسخة الحية،
 * وتذييل ثابت أسفل كل صفحة (هوية المنصة + الرابط + رقم الصفحة).
 *
 * لا عناصر واجهة تفاعلية إطلاقًا — بلا مشغل صوت ولا أزرار ولا تعليقات.
 * ISR: الوثيقة تُخزَّن ساعةً وتُخدَّم من حافة CDN في الطلبات التالية.
 */
export const revalidate = 3600;

/** تحويل صورة الغلاف إلى JPEG نظيف مضمّن + نسبتها الحقيقية — وفشلها لا يعطل التصدير أبدًا */
async function coverToDataUrl(url: string): Promise<{ dataUrl: string; ratio: number | null } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(raw)
      .rotate()
      .resize(1400, 900, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#FFFFFF" })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const w = jpg.info.width || 0;
    const h = jpg.info.height || 0;
    return {
      dataUrl: `data:image/jpeg;base64,${jpg.data.toString("base64")}`,
      ratio: w > 0 && h > 0 ? w / h : null,
    };
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: rawSlug } = await params;
    const article = await getArticleBySlug(safeDecodeSlug(rawSlug));
    if (!article) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://kalam-ziadamr.vercel.app";
    const articleUrl = `${siteUrl}/article/${encodeURIComponent(article.slug)}`;

    /* رمز الاستجابة السريعة — يوجه مباشرة إلى رابط المقال الحي */
    const qrDataUrl = await QRCode.toDataURL(articleUrl, {
      margin: 1,
      width: 360,
      errorCorrectionLevel: "M",
      color: { dark: "#1E293BFF", light: "#FFFFFFFF" },
    });

    const cover = article.coverImage
      ? await coverToDataUrl(article.coverImage)
      : null;

    const buffer = await renderArticlePdf({
      title: article.title,
      summary: article.summary || null,
      content: article.content,
      coverImage: cover?.dataUrl ?? null,
      coverRatio: cover?.ratio ?? null,
      qrDataUrl,
      sectionName: article.section?.name ?? null,
      publishedAt: article.publishedAt ?? null,
      authorName: "فريق كلام له لازمة",
      articleUrl,
    });

    const asciiName = `kalam-${Date.now()}.pdf`;
    const arabicName = encodeURIComponent(`كلام له لازمة — ${article.slug}.pdf`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${arabicName}`,
        /* كاش قصير بلا stale-while-revalidate — تحديثات محرك التصدير
           تصل للقارئين خلال دقائق ولا تبقى نسخ PDF قديمة أسبوعًا كاملًا
           (السبب الموثق لرؤية مستخدمين نسخة مفككة الحروف بعد الإصلاح) */
        "Cache-Control": "public, max-age=300, s-maxage=21600",
      },
    });
  } catch (err) {
    await recordServerError({
      err,
      app: "PUBLIC",
      path: "/api/articles/[slug]/pdf",
      method: "GET",
      requestId: null,
      url: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/system?tab=errors`,
    });
    return NextResponse.json({ error: "تعذر توليد الوثيقة الآن" }, { status: 500 });
  }
}
