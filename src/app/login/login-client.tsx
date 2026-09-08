"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

import { Footer } from "@/components/footer";

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

/* رسائل ودية لكل خطأ وارد من NextAuth — بلا شاشات سوداء أو أخطاء صامتة */
const AUTH_ERRORS: Record<string, string> = {
  Configuration:
    "حدث خلل لحظي في إعدادات الدخول على الخادم — جرّب تحديث الصفحة، وإن تكرر فسنعلم به فورًا ونصلحه.",
  AccessDenied:
    "هذا الحساب محظور من المشاركة في المنصة. إن كان في رأيك خطأً فتواصل معنا من صفحة اتصل بنا.",
  Verification: "انتهت صلاحية رابط الدخول — جرّب مرة أخرى من فضلك.",
  Default: "تعذّر إكمال تسجيل الدخول — تحقق من اتصالك وجرّب مرة أخرى.",
};

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  /* الوجهة بعد الدخول: ?callback=... أو الصفحة الرئيسية */
  const callback = params.get("callback") || "/";
  const authError = params.get("error");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callback.startsWith("/") ? callback : "/");
      return;
    }
    fetch("/api/auth-providers")
      .then((r) => r.json())
      .then((d) => setGoogleReady(Boolean(d.google)))
      .catch(() => setGoogleReady(false));
  }, [status, router, callback]);

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await signIn("google", { redirectTo: callback.startsWith("/") ? callback : "/" });
    } catch {
      /* تحويل ناعم بدل خطأ صامت — الخطأ يظهر كرسالة ودية في نفس الصفحة */
      router.replace("/login?error=Configuration");
    }
  };

  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 pb-32 pt-28 text-center sm:px-6">
      {/* الشعار النصي */}
      <p className="font-ui text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
        كلام له لازمة
      </p>
      <h1
        className="mt-4 font-body text-2xl font-bold leading-[1.7] sm:text-3xl"
        style={{ color: "var(--ink)" }}
      >
        اقرأ.. حاور.. واحفظ ما يلهمك
      </h1>
      <p className="mt-4 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
        بحساب واحد تُزامَن قراءاتك المحفوظة عبر أجهزتك،
        <br />
        وتشارك في حوار نقي — بلا مزعجين وبلا حسابات وهمية.
      </p>

      {/* إشعار الخطأ الودي — بدل شاشة الخادم المعطلة */}
      {authError && (
        <div
          className="mt-6 w-full rounded-2xl border p-4 text-right text-xs leading-7"
          style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}
          role="alert"
        >
          <strong className="block font-bold">تعذّر تسجيل الدخول</strong>
          {AUTH_ERRORS[authError] || AUTH_ERRORS.Default}
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => router.replace("/login")}
              className="rounded-lg bg-[#991B1B] px-3 py-1.5 text-[11px] font-bold text-white"
            >
              المحاولة مجددًا
            </button>
            <Link href="/contact" className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-[11px] font-bold">
              إبلاغ الإدارة
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8 w-full rounded-3xl border p-6 shadow-lift sm:p-8"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {googleReady === null ? (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            جارٍ التحقق..
          </p>
        ) : googleReady ? (
          <>
            <button
              onClick={handleGoogle}
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-bold transition-all duration-300 hover:shadow-lift disabled:opacity-60"
              style={{
                background: "var(--bg)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
            >
              <GoogleMark />
              {busy ? "جارٍ التحويل.." : "المتابعة بحساب Google"}
            </button>
            {/* الموافقة القانونية الكاملة — ثلاثة روابط منفصلة لكل مساره */}
            <p className="mt-5 text-[11px] leading-6" style={{ color: "var(--ink-muted)" }}>
              بتسجيلك للدخول، فإنك تؤكد موافقتك على{" "}
              <Link href="/terms" className="underline" style={{ color: "var(--accent-strong)" }}>
                شروط الاستخدام
              </Link>{" "}
              و{" "}
              <Link href="/privacy" className="underline" style={{ color: "var(--accent-strong)" }}>
                سياسة الخصوصية
              </Link>
              ، والتزامك التام بـ{" "}
              <Link href="/dialogue-ethics" className="underline" style={{ color: "var(--accent-strong)" }}>
                أخلاقيات الحوار والتعليق
              </Link>{" "}
              الخاصة بالمنصة.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-dashed p-6"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="font-body text-base font-bold leading-8" style={{ color: "var(--ink)" }}>
                تسجيل الدخول بجوجل جاهز.. بانتظار المفاتيح
              </p>
              <p className="mt-3 text-xs leading-7" style={{ color: "var(--ink-muted)" }}>
                البنية التقنية اكتملت 100٪. لمّا يضيف مالك المنصة مفاتيح
                Google OAuth ستشتغل هذه الصفحة تلقائيًا دون أي تحديث إضافي.
              </p>
            </div>
            <Link
              href="/"
              className="mt-6 inline-block rounded-2xl px-6 py-3 text-sm font-bold transition-all hover:scale-105"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              تصفّح المقالات الآن — بلا حساب
            </Link>
          </>
        )}
      </div>

      <p className="mt-8 text-xs" style={{ color: "var(--ink-muted)" }}>
        القراءة والتصفح متاحان للجميع دون حساب — الحساب للمشاركة والحفظ المتزامن فقط.
      </p>
    </section>
  );
}

export default function LoginClient() {
  return (
    <>
      <main className="flex-1">
        <Suspense
          fallback={
            <p className="pt-32 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              جارٍ التحميل..
            </p>
          }
        >
          <LoginInner />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
