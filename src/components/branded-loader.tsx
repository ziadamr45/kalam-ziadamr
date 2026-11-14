export function BrandedLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-8"
      aria-busy="true"
      aria-label={label}
    >
      <style>{`
        .kalam-loader-kaf {
          animation: kalam-kaf-glow 2.2s ease-in-out infinite;
        }
        .kalam-loader-line {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: kalam-line-write 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes kalam-kaf-glow {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }
        @keyframes kalam-line-write {
          0% { stroke-dashoffset: 100; opacity: 0.35; }
          55% { stroke-dashoffset: 0; opacity: 1; }
          82% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -100; opacity: 0.25; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kalam-loader-kaf { animation: none !important; opacity: 1 !important; }
          .kalam-loader-line { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; }
        }
      `}</style>
      <div className="flex flex-col items-center gap-6 text-center animate-fade-in [@media(max-height:500px)]:gap-3">
        <div className="relative flex items-center justify-center">
          <span
            className="absolute inset-0 -m-3 rounded-[30%] animate-pulse"
            style={{
              background: "color-mix(in srgb, var(--accent) 18%, transparent)",
            }}
            aria-hidden
          />
          {/* الشعار المتجهي الخفيف للمنصة — وميض هادئ لحرف الكاف + رسم الخط أسفله عبر GPU فقط */}
          <div
            className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[26%] border shadow-lift sm:h-28 sm:w-28 md:h-32 md:w-32 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-16"
            style={{
              background: "#0D1626",
              borderColor: "var(--border)",
            }}
            role="img"
            aria-label="كلام له لازمة"
          >
            <svg
              viewBox="0 0 128 128"
              fill="none"
              className="h-full w-full"
              aria-hidden
            >
              <g className="kalam-loader-kaf">
                <path
                  d="M92 22 L92 66 Q92 84 70 84 L40 84 Q25 84 24 70"
                  stroke="#D9A441"
                  strokeWidth="10.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M63 36 C53 36 49 44 57 47 C64 50 58 59 47 59"
                  stroke="#D9A441"
                  strokeWidth="7.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <path
                d="M94 103 L34 103"
                pathLength={100}
                stroke="#D9A441"
                strokeWidth="9"
                strokeLinecap="round"
                className="kalam-loader-line"
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