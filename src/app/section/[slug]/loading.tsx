export default function SectionLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 pt-20" aria-busy="true" aria-label="جارٍ فتح القسم">
      <div className="flex flex-col items-center gap-4 text-center animate-fade-in">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-3xl border shadow-soft animate-pulse"
          style={{
            background: "var(--surface)",
            borderColor: "var(--accent-soft)",
            color: "var(--accent-strong)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20.2 3.8c-5.8.4-10.5 4-12.5 9.4L3 21l7.9-4.7c5.4-2 9-6.7 9.3-12.5Z" />
            <path d="M6.5 17.5 13 11" />
          </svg>
        </div>
        <p className="font-ui text-xs font-semibold" style={{ color: "var(--ink-muted)" }}>
          جارٍ فتح القسم…
        </p>
      </div>
    </div>
  );
}
