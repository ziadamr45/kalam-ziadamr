import { googleConfigured } from "@/lib/auth";

/** تكشف الواجهة من خلاله إن كان تسجيل الدخول بجوجل مفعّلًا فعلًا */
export async function GET() {
  return Response.json(
    { google: googleConfigured },
    { headers: { "cache-control": "no-store" } },
  );
}
