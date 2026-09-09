import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import LoginGate from "./login-gate";

export const metadata: Metadata = {
  title: "بوابة الوصول — كلام له لازمة",
  description: "سجّل الدخول بحساب Google أو أنشئ حسابك تلقائيًا للمشاركة في الحوار ومزامنة مكتبتك.",
};

export default function AuthLoginPage() {
  return (
    <>
      <SiteHeader />
      <LoginGate />
    </>
  );
}
