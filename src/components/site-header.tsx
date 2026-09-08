import { Header, type NavSection } from "@/components/header";
import { getActiveSections } from "@/lib/db-queries";
import { SECTIONS } from "@/lib/sections";

/**
 * ترويسة خادمية — بديل `<Header />` المباشر:
 * تجلب الأقسام الحية من قاعدة بيانات Neon عبر Prisma (الأقسام النشطة
 * مرتّبة حسب sortOrder مع عدّاد المقالات المنشورة) وتمرّرها كمُعاملات
 * إلى مكوّن الهيدر التفاعلي، فتظهر أي قسم يضيفه الأدمن فورًا في
 * القائمة الجانبية وقائمة سطح المكتب دون تعديل أي كود.
 *
 * عند عجز مؤقت لقاعدة البيانات نعود للأقسام المعتمدة كي لا تفقد
 * القائمة بؤرتها — لكن المصدر الأساسي هو قاعدة البيانات وحدها.
 */
export async function SiteHeader() {
  let nav: NavSection[] = [];

  try {
    const rows = await getActiveSections();
    if (rows) {
      nav = rows.map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description ?? "",
        count: s._count.articles,
      }));
    }
  } catch {}

  /* شبكة أمان عند غياب البيانات كليًا — لا تُستخدم إلا إذا فشل الاستعلام */
  if (nav.length === 0) {
    nav = SECTIONS.map((s) => ({ ...s, count: 0 }));
  }

  return <Header navSections={nav} />;
}
