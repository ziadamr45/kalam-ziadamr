"use client";

/* خطأ على مستوى الجذر (خارج تخطيط الصفحة) — واجهة مستقلة بسيطة تعمل دائمًا */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf9f5", margin: 0 }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ textAlign: "center", maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#1c1917" }}>حدث خلل بسيط</h1>
            <p style={{ marginTop: "1rem", lineHeight: 2, color: "#78716c" }}>
              شيء ما لم يعمل كما يجب.. جرّب مرة أخرى.
              <br />
              إن تكرر الأمر فقد وصل إشعاره للإدارة بالفعل وسنعالجه سريعًا.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "2rem",
                borderRadius: "9999px",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                background: "var(--accent, #b45309)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
            {error?.digest ? (
              <p style={{ marginTop: "1.5rem", fontSize: "0.65rem", color: "#a8a29e", overflowWrap: "anywhere" }}>
                رمز التتبع: {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
