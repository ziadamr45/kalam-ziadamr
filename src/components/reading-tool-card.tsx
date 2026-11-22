export const mobileReadingToolClass = "max-sm:flex max-sm:min-h-27 max-sm:flex-col max-sm:items-center max-sm:justify-center max-sm:gap-2.5 max-sm:rounded-2xl max-sm:border max-sm:border-(--border) max-sm:bg-(--bg) max-sm:px-2 max-sm:py-3 max-sm:text-sm max-sm:font-medium max-sm:text-(--ink)! max-sm:transition-colors max-sm:hover:border-(--accent) max-sm:focus-visible:outline-2 max-sm:focus-visible:outline-offset-2 max-sm:focus-visible:outline-(--accent)";

export function ReadingToolIcon({ kind }: { kind: "tashkeel" | "summary" | "pdf" | "quote" }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent-strong) sm:hidden">
      {kind === "tashkeel" ? <span className="font-body text-2xl font-bold leading-none">تَ</span> : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {kind === "summary" && <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>}
          {kind === "pdf" && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 12v6m-3-3 3 3 3-3" /></>}
          {kind === "quote" && <><path d="M9 6H3v7h6V6Zm12 0h-6v7h6V6ZM9 13c0 4-2 5-5 5m17-5c0 4-2 5-5 5" /></>}
        </svg>
      )}
    </span>
  );
}
