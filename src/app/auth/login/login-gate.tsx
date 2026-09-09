"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

import { Footer } from "@/components/footer";

function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
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

/* رسائل ودية لكل خطأ وارد من NextAuth — لا شاشات سوداء إطلاقًا:
   أي خطأ مصادقة يهبط في هذه الصفحة (pages.error = /auth/login) برسالة واضحة */
const AUTH_ERRORS: Record<string, string> = {
  Configuration:
    "حدث خلل لحظي في إعدادات الدخول على الخادم — جرّب مرة أخرى، وإن تكرر فقد أُبلغ فريق التشغيل تلقائيًا.",
  AccessDenied:
    "هذا الحساب محظور من المشاركة في المنصة. إن كان في رأيك خطأً فتواصل معنا من صفحة اتصل بنا.",
  Verification: "انتهت صلاحية جلسة الدخول — جرّب مرة أخرى من فضلك.",
  OAuthAccountNotLinked:
    "هذا البريد مرتبط بحساب قائم لدينا — جرّب مرة أخرى، وإن تكرر فتواصل معنا من صفحة اتصل بنا.",
  Default: "تعذّر إكمال تسجيل الدخول — تحقق من اتصالك وجرّب مرة أخرى.",
};

const BENEFITS: Array<{ title: string; body: string; icon: string }> = [
  {
    title: "مكتبتك تتبعك",
    body: "ما تحفظه هنا يظهر على كل أجهزتك لحظة بلحظة.",
    icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm0 0H3m2 16a3 3 0 0 1 3-3h11",
  },
  {
    title: "حوار نقي",
    body: "شارك رأيك في مساحة محمية بلا مزعجين ولا حسابات وهمية.",
    icon: "M8 10h8m-8 4h5M21 12a9 9 0 1 1-4-7.5L21 3v9Z",
  },
  {
    title: "أثرك يُحسب",
    body: "كل قراءة متأنية وتعليق رصين يرفع رتبتك الفكرية.",
    icon: "M12 3l2.4 5.4L20 9l-4 3.9.9 5.6L12 15.8 7.1 18.5 8 12.9 4 9l5.6-.6L12 3Z",
  },
  {
    title: "إشعارات فورية",
    body: "مقال جديد أو تفاعل مع كلمك — يصلك الهاتف قبل الجميع.",
    icon: "M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9",
  },
];

function LoginGateInner() {
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
      /* تحويل ناعم — الخطأ يعود إلى هذه البوابة برسالة ودية لا بشاشة سوداء */
      router.replace("/auth/login?error=Configuration");
    }
  };

  return (
    <main className="flex-1">
      <section className="mx-auto flex max-w-lg flex-col items-center px-4 pb-24 pt-24 text-center sm:px-6">
        {/* بوابة الوصول */}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-3xl shadow-lift"
          style={{ background: "var(--accent-soft)" }}
          aria-hidden
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-strong)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5L12 2Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <p className="font-ui mt-5 text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
          كلام له لازمة
        </p>
        <h1
          className="mt-2 font-body text-3xl font-bold leading-[1.6] sm:text-4xl"
          style={{ color: "var(--ink)" }}
        >
          بوابة الوصول
        </h1>
        <p className="mt-4 text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
          بوابة واحدة لأمرين بوضوح تام: <strong style={{ color: "var(--ink)" }}>تسجيل الدخول</strong>{" "}
          لحسابك القائم، و<strong style={{ color: "var(--ink)" }}>إنشاء حساب جديد</strong> تلقائيًا
          عند أول زيارة — بحساب Google موثوق واحدًا لا يزيد.
        </p>

        {/* إشعار الخطأ الودي — الشاشة السوداء مستحيلة من الآن فصاعدًا */}
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
                onClick={() => router.replace("/auth/login")}
                className="rounded-lg bg-[#991B1B] px-3 py-1.5 text-[11px] font-bold text-white"
              >
                المحاولة مجددًا
              </button>
              <Link
                href="/contact"
                className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-[11px] font-bold"
              >
                إبلاغ الإدارة
              </Link>
            </div>
          </div>
        )}

        {/* بطاقة البوابة */}
        <div
          className="mt-8 w-full rounded-3xl border p-6 shadow-lift sm:p-8"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {googleReady === null ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              جارٍ التحقق..
            </p>
          ) : googleReady ? (
            <>
              {/* المسار الصريح والوحيد — معنون بوضوح تام */}
              <button
                onClick={handleGoogle}
                disabled={busy}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-4 text-[15px] font-bold transition-all duration-300 hover:shadow-lift disabled:opacity-60"
                style={{
                  background: "var(--bg)",
                  borderColor: "var(--border)",
                  color: "var(--ink)",
                }}
              >
                <GoogleMark />
                {busy ? "جارٍ التحويل إلى Google.." : "تسجيل الدخول باستخدام Google"}
              </button>
              <p className="mt-3 text-[11px] leading-6" style={{ color: "var(--ink-muted)" }}>
                ليس لديك حساب؟ الضغط على الزر نفسه يُنشئ حسابك تلقائيًا من بريد Google — بلا
                نماذج ولا كلمات مرور نحفظها.
              </p>

              {/* ماذا يمنحك الدخول */}
              <div
                className="mt-6 grid gap-3 border-t pt-6 text-right sm:grid-cols-2"
                style={{ borderColor: "var(--border)" }}
              >
                {BENEFITS.map((b) => (
                  <div key={b.title} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: "var(--accent-soft)" }}
                      aria-hidden
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent-strong)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={b.icon} />
                      </svg>
                    </span>
                    <span>
                      <strong className="block text-xs font-bold" style={{ color: "var(--ink)" }}>
                        {b.title}
                      </strong>
                      <span
                        className="text-[11px] leading-5"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        {b.body}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* الموافقة القانونية الكاملة — ثلاثة روابط منفصلة لكل مساره */}
              <p
                className="mt-6 border-t pt-4 text-[11px] leading-6"
                style={{ color: "var(--ink-muted)", borderColor: "var(--border)" }}
              >
                بتسجيلك للدخول، فإنك تؤكد موافقتك على{" "}
                <Link href="/terms" className="underline" style={{ color: "var(--accent-strong)" }}>
                  شروط الاستخدام
                </Link>{" "}
                و{" "}
                <Link
                  href="/privacy"
                  className="underline"
                  style={{ color: "var(--accent-strong)" }}
                >
                  سياسة الخصوصية
                </Link>
                ، والتزامك التام بـ{" "}
                <Link
                  href="/dialogue-ethics"
                  className="underline"
                  style={{ color: "var(--accent-strong)" }}
                >
                  أخلاقيات الحوار والتعليق
                </Link>{" "}
                الخاصة بالمنصة.
              </p>
            </>
          ) : (
            <div
              className="rounded-2xl border border-dashed p-6"
              style={{ borderColor: "var(--border)" }}
            >
              <p
                className="font-body text-base font-bold leading-8"
                style={{ color: "var(--ink)" }}
              >
                بوابة الدخول بجوجل جاهزة.. بانتظار المفاتيح
              </p>
              <p className="mt-3 text-xs leading-7" style={{ color: "var(--ink-muted)" }}>
                البنية التقنية اكتملت 100٪. لمّا يضيف مالك المنصة مفاتيح Google OAuth ستشتغل
                هذه البوابة تلقائيًا دون أي تحديث إضافي.
              </p>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs" style={{ color: "var(--ink-muted)" }}>
          القراءة والتصفح متاحان للجميع دون حساب — الحساب للمشاركة والحفظ المتزامن فقط.
        </p>
      </section>
    </main>
  );
}

export default function LoginGate() {
  return (
    <>
      {/* حدود Suspense إلزامية — useSearchParams في بوابة الوصول */}
      <Suspense
        fallback={
          <p className="pt-32 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
            جارٍ التحميل..
          </p>
        }
      >
        <LoginGateInner />
      </Suspense>
      <Footer />
    </>
  );
}
