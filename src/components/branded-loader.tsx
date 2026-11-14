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
              background: "color-mix(in srgb, var(--accent) 18%, transparent)",
            }}
            aria-hidden
          />
          {/* الشعار الرسمي للمنصة حرفيًا (/icons/icon-192.png) بأحجام كبيرة متجاوبة */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="كلام له لازمة"
            width={128}
            height={128}
            className="relative h-24 w-24 rounded-[26%] border object-cover shadow-lift sm:h-28 sm:w-28 md:h-32 md:w-32 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-16"
            style={{ borderColor: "var(--border)" }}
          />
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
