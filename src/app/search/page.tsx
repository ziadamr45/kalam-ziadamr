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
};

export default function SearchPage() {
  return <SearchView />;
}
