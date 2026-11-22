import { Footer } from "@/components/footer";
import { getActiveSections } from "@/lib/db-queries";

/**
 * تذييل خادمي — التوأم الروحي لمكوّن SiteHeader:
 * يجلب الأقسام الحية من قاعدة البيانات (Neon عبر Prisma — الأقسام النشطة
 * مرتّبة حسب sortOrder) ويمرّرها إلى مكوّن التذييل التفاعلي كأقسام ابتدائية،
 * فتُرسم روابط الأقسام داخل HTML السيرفر نفسه. بهذا يطابق ما يراه الزواحف
 * ونماذج الذكاء الاصطناعي في مصدر الصفحة بالضبط ما يعتمده الأدمن في لوحة
 * التحكم — لا قوائم قديمة متجمدة تنتظر تنفيذ JavaScript لتُصحَّح.
 *
 * عند تعذر جلب الأقسام لا ننشئ روابط لأقسام قديمة أو محذوفة.
 */
export async function SiteFooter() {
  let sections: { slug: string; name: string }[] = [];

  try {
    const rows = await getActiveSections();
    if (rows) {
      sections = rows.map((s) => ({ slug: s.slug, name: s.name }));
    }
  } catch {}

  return <Footer initialSections={sections} />;
}
