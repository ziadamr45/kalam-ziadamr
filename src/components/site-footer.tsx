import { Footer } from "@/components/footer";
import { getActiveSections } from "@/lib/db-queries";
import { SECTIONS } from "@/lib/sections";

/**
 * تذييل خادمي — التوأم الروحي لمكوّن SiteHeader:
 * يجلب الأقسام الحية من قاعدة البيانات (Neon عبر Prisma — الأقسام النشطة
 * مرتّبة حسب sortOrder) ويمرّرها إلى مكوّن التذييل التفاعلي كأقسام ابتدائية،
 * فتُرسم روابط الأقسام داخل HTML السيرفر نفسه. بهذا يطابق ما يراه الزواحف
 * ونماذج الذكاء الاصطناعي في مصدر الصفحة بالضبط ما يعتمده الأدمن في لوحة
 * التحكم — لا قوائم قديمة متجمدة تنتظر تنفيذ JavaScript لتُصحَّح.
 *
 * عند عجز مؤقت لقاعدة البيانات نعود للأقسام المعتمدة كي لا يفقد التذييل
 * بؤرته — والمكوّن العميل يجدد القائمة لحظيًا بعد الترطيب على أي حال.
 */
export async function SiteFooter() {
  let sections: { slug: string; name: string }[] = [];

  try {
    const rows = await getActiveSections();
    if (rows) {
      sections = rows.map((s) => ({ slug: s.slug, name: s.name }));
    }
  } catch {}

  /* شبكة أمان عند غياب البيانات كليًا — لا تُستخدم إلا إذا فشل الاستعلام */
  if (sections.length === 0) {
    sections = SECTIONS.map((s) => ({ slug: s.slug, name: s.name }));
  }

  return <Footer initialSections={sections} />;
}
