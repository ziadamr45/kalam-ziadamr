import { redirect } from "next/navigation";

/**
 * /me صارت /profile — صفحة الهوية ورصيد الأثر الموحدة.
 * توجيه دائم النية يحفظ الروابط القديمة في الأجهزة والمحفوظات.
 */
export default function MeRedirect() {
  redirect("/profile");
}
