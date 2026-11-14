export default function SectionLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-28 pb-24 sm:px-6" aria-busy="true" aria-label="جارٍ تحميل القسم">
      <div className="h-10 w-48 animate-pulse rounded-2xl" style={{ background: "var(--bg-soft)" }} />
      <div className="mt-3 h-4 w-72 animate-pulse rounded-full" style={{ background: "var(--bg-soft)" }} />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
        ))}
      </div>
    </div>
  );
}
