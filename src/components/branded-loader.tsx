export function BrandedLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-8"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-6 text-center animate-fade-in [@media(max-height:500px)]:gap-3">
        <div className="relative flex items-center justify-center">
          <span
            className="absolute inset-0 -m-3 rounded-[30%] animate-pulse"
            style={{
              background: "color-mix(in srgb, var(--accent) 16%, transparent)",
            }}
            aria-hidden
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-[28%] border shadow-lift sm:h-28 sm:w-28 md:h-32 md:w-32 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-16"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            {/* الشعار الرسمي للمنصة — يتكيّف تلقائيًا مع الوضع الفاتح والوضع الداكن */}
            <svg
              viewBox="0 0 120 120"
              fill="none"
              aria-hidden
              className="h-[64%] w-[64%]"
            >
              <path
                d="M78 24 L50 50 C44 55 46 62 54 64 L66 67 C74 69 75 78 65 81 L32 81"
                stroke="var(--accent)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M44 103 L76 103"
                stroke="var(--accent)"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <div className="space-y-1.5 [@media(max-height:500px)]:space-y-0.5">
          <p
            className="font-ui text-xl font-extrabold sm:text-2xl md:text-3xl [@media(max-height:500px)]:text-base"
            style={{ color: "var(--ink)" }}
          >
            كلام له لازمة
          </p>
          <p
            className="font-ui text-sm font-semibold sm:text-base [@media(max-height:500px)]:text-xs"
            style={{ color: "var(--ink-muted)" }}
          >
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
