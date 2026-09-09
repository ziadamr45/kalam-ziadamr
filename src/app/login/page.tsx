import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "بوابة الوصول — كلام له لازمة",
};

/**
 * المسار القديم /login — كل روابط الموقع والذاكرة القديمة تحمل إليه:
 * يُحوَّل فورًا إلى بوابة الوصول الجديدة /auth/login مع حفظ
 * بارامترات callback وerror كما هي تمامًا.
 */
export default async function LegacyLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const suffix = qs.toString();
  redirect(`/auth/login${suffix ? `?${suffix}` : ""}`);
}
