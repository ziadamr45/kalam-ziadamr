export function BrandedLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex w-full items-center justify-center overflow-hidden px-4 py-6"
      style={{ background: "var(--bg)" }}
      aria-busy="true"
      aria-label={label}
    >
      <style>{`
        .kalam-loader-reveal {
          animation: kalam-delayed-in 0.25s ease-out 0.18s both;
        }
        .kalam-loader-line {
          stroke-dasharray: 100;
          stroke-dashoffset: 60;
          animation: kalam-line-write 1s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes kalam-delayed-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes kalam-line-write {
          0% { stroke-dashoffset: 60; opacity: 0.65; }
          55% { stroke-dashoffset: 0; opacity: 1; }
          85% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -100; opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kalam-loader-reveal { animation: none !important; opacity: 1 !important; }
          .kalam-loader-line { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; }
        }
      `}</style>
      <div className="kalam-loader-reveal flex flex-col items-center gap-4 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border shadow-soft"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--accent)",
          }}
          role="img"
          aria-label="كلام له لازمة"
        >
          <svg viewBox="16 14 96 112" fill="none" className="h-9 w-9" aria-hidden>
            <path
              d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
              fill="currentColor"
            />
            <path
              d="M80.5 120.5 L46.5 120.5"
              pathLength={100}
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              className="kalam-loader-line"
            />
          </svg>
        </div>
        <p className="font-ui text-sm font-semibold" style={{ color: "var(--ink-muted)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}
