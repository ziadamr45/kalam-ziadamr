import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import LoginGate from "./login-gate";

export const metadata: Metadata = {
  title: "بوابة الوصول — كلام له لازمة",
  description: "سجّل الدخول بحساب Google أو أنشئ حسابك تلقائيًا للمشاركة في الحوار ومزامنة مكتبتك.",
};

export default async function AuthLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const revoked = sp?.revoked === "true";

  return (
    <>
      <SiteHeader />
      {revoked && (
        <div className="mx-auto w-full max-w-xl px-4 pt-6 sm:px-6">
          <div
            role="status"
            className="rounded-2xl border px-5 py-4"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <p className="font-ui text-sm font-bold" style={{ color: "var(--ink)", textAlign: "right" }}>
              تم إنهاء جلستك على هذا الجهاز من لوحة التحكم
            </p>
            <p className="font-body mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)", textAlign: "right" }}>
              يمكنك تسجيل الدخول مرة أخرى في أي وقت — قراءاتك محفوظة بأمان.
            </p>
          </div>
        </div>
      )}
      <LoginGate />
    </>
  );
}
