import type { Metadata } from "next";
import SearchView from "./search-view";

/**
 * صفحة البحث الفكري — وجهة PWA Shortcut:
 * تحتضن محرك البحث اللحظي بصفحة كاملة (المكوّن SearchPalette
 * في الهيدر يبقى كما هو للفوريات داخل التنقل).
 */
export const metadata: Metadata = {
  title: "البحث الفكري",
  description: "ابحث في العناوين والمتن والأفكار — في كل مقالات المنصة",
  /* صفحة أداة بحث داخلية لا محتوى مستقل — جوجل نفسه يوصي بعدم فهرسة
     صفحات البحث حتى لا تستنزف زحفه وتتنافس مع المقالات في النتائج */
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return <SearchView />;
}
