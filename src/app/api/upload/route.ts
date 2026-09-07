import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadImage, cloudinaryConfigured } from "@/lib/cloudinary";

/**
 * رفع صور سحابي عبر Cloudinary — السيرفر فقط.
 * سرّ الـ API يبقى خلف الخادم ولا يقترب من المتصفح أبدًا.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب" }, { status: 401 });
  }

  if (!cloudinaryConfigured) {
    return NextResponse.json(
      { error: "خدمة رفع الصور غير مهيأة — تُضاف مفاتيح Cloudinary إلى متغيرات البيئة" },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "لم يُرفق ملف" }, { status: 400 });
    }

    /* الحد الأقصى 8MB وقيود نوع الصورة */
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "الصورة أكبر من 8MB — اختر صورة أخف" }, { status: 413 });
    }
    const type = file.type || "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "تُقبل الصور فقط (JPG / PNG / WebP)" }, { status: 415 });
    }

    const filename = (form.get("filename") as string) || "image";
    const folder = (form.get("folder") as string) === "account" ? "kalam/accounts" : "kalam/articles";
    const result = await uploadImage(file, filename, folder);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل الرفع السحابي" },
      { status: 500 },
    );
  }
}
