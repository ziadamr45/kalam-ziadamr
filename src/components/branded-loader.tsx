export function BrandedLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[65dvh] items-center justify-center px-4 pt-16"
      aria-busy="true"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-5 text-center animate-fade-in">
        <div className="relative flex items-center justify-center">
          <span
            className="absolute inset-0 -m-2.5 rounded-[30%] animate-pulse"
            style={{
              background: "color-mix(in srgb, var(--accent) 16%, transparent)",
            }}
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="كلام له لازمة"
            width={112}
            height={112}
            className="relative h-20 w-20 rounded-[26%] border object-cover shadow-lift sm:h-24 sm:w-24 md:h-28 md:w-28"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
        <div className="space-y-1">
          <p className="font-ui text-base font-extrabold sm:text-lg" style={{ color: "var(--ink)" }}>
            كلام له لازمة
          </p>
          <p className="font-ui text-xs font-semibold sm:text-sm" style={{ color: "var(--ink-muted)" }}>
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
