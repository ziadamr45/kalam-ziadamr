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
          <div
            className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[26%] border shadow-lift sm:h-28 sm:w-28 md:h-32 md:w-32 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-16"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--accent)",
            }}
            role="img"
            aria-label="كلام له لازمة"
          >
            <svg
              viewBox="0 0 128 128"
              fill="none"
              className="h-full w-full"
              style={{ filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.18))" }}
              aria-hidden
            >
              <path
                d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
                fill="currentColor"
                className="kalam-loader-kaf"
              />
              <path
                d="M80.5 120.5 L46.5 120.5"
                pathLength={100}
                stroke="currentColor"
                strokeWidth="4"
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
