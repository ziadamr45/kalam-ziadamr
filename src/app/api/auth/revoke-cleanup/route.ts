import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * مسح الجلسة المُبطلة الصارم — قلب إصلاح حلقة التحديث اللانهائية:
 *
 * عند إبطال جهاز من صفحة الملف (حذف سجله من UserDevice) تبقى كوكيز
 * الجلسة القديمة httpOnly مخزنة في متصفح ذلك الجهاز، ولا يستطيع
 * JavaScript حذفها. كان الاعتماد سابقًا على نداء /api/auth/signout
 * بنداء خام بلا CSRF فيفشل صامتًا ويبقى الكوكي حيًا → كل تحديث
 * يعيد اكتشاف الإبطال → حلقة لا نهائية.
 *
 * هذا المسار هو بوابة المسح الصارم: يتحقق من الجلسة عبر auth()
 * (بوابة UserDevice داخل callback الجلسة تضع deviceRevoked)، وإن
 * كانت مُبطلة يُلحق بالاستجابة حذف فوري لكافة كوكيز الجلسة بكل
 * أسمائها المحتملة (authjs/next-auth × بادئتي __Secure- و __Host-)
 * بـ maxAge=0 — فيموت الكوكي في نفس جولة الشبكة وتنكسر الحلقة.
 */

/** كل أسماء كوكيز الجلسة المحتملة عبر بيئات وإصدارات Auth.js */
const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.state",
  "__Secure-next-auth.state",
  "authjs.state",
  "__Secure-authjs.state",
];

/** لا كاش نهائيًا — استجابة أمنية شخصية */
const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(_request: NextRequest) {
  let revoked = false;
  try {
    const session = await auth();
    revoked = Boolean((session as { deviceRevoked?: boolean } | null)?.deviceRevoked);
  } catch {
    revoked = false;
  }

  const response = NextResponse.json({ revoked }, { headers: noStore });
  if (!revoked) return response;

  /* المسح الصارم — انتهاء صريح لكل كوكيز الجلسة في استجابة واحدة */
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    response.cookies.delete(name);
  }
  return response;
}
