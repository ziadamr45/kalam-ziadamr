export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-28 pb-24 sm:px-6" aria-busy="true" aria-label="جارٍ تحميل الحساب">
      <div className="h-12 animate-pulse rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
      <div className="mt-6 h-44 animate-pulse rounded-3xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
      <div className="mt-6 h-32 animate-pulse rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
    </div>
  );
}
