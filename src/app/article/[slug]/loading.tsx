export default function ArticleLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-28 pb-24 sm:px-6" aria-busy="true" aria-label="جارٍ تحميل المقال">
      <div className="mx-auto h-7 w-24 animate-pulse rounded-full" style={{ background: "var(--accent-soft)" }} />
      <div className="mx-auto mt-6 h-10 w-3/4 animate-pulse rounded-2xl" style={{ background: "var(--bg-soft)" }} />
      <div className="mx-auto mt-4 h-4 w-1/2 animate-pulse rounded-full" style={{ background: "var(--bg-soft)" }} />
      <div className="mt-8 h-64 animate-pulse rounded-2xl" style={{ background: "var(--bg-soft)" }} />
      <div className="mt-8 space-y-4">
        <div className="h-4 w-full animate-pulse rounded-full" style={{ background: "var(--bg-soft)" }} />
        <div className="h-4 w-11/12 animate-pulse rounded-full" style={{ background: "var(--bg-soft)" }} />
        <div className="h-4 w-4/5 animate-pulse rounded-full" style={{ background: "var(--bg-soft)" }} />
      </div>
    </div>
  );
}
