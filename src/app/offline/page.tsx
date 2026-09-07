export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="text-center">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h1 className="font-body text-3xl font-bold" style={{ color: "var(--ink)" }}>
          أنت دون اتصال
        </h1>
        <p className="font-body mt-4 leading-9" style={{ color: "var(--ink-muted)" }}>
          لا مشكلة.. كل مقال حفظته سابقًا متاح للقراءة الآن.
        </p>
      </div>
    </main>
  );
}
