import { rankMeta } from "@/lib/ranks";

/**
 * شارة الرتبة الفكرية — تصميم بصري وقور وناعم:
 * حرف زخرفي ماسي بلون الرتبة + اسمها، بحجمين (صغير للتعليقات، عادي للملف).
 * مكوّن متزامن يعمل في السيرفر والعميل بلا حالة.
 */
export function RankBadge({
  rank,
  size = "sm",
}: {
  rank: string | null | undefined;
  size?: "sm" | "md";
}) {
  const meta = rankMeta(rank);
  const isMd = size === "md";

  return (
    <span
      title={`${meta.key} — ${meta.hint}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full font-bold leading-none"
      style={{
        background: meta.soft,
        color: meta.color,
        fontSize: isMd ? "12px" : "10px",
        padding: isMd ? "5px 10px" : "3px 8px",
      }}
    >
      <svg
        width={isMd ? 12 : 10}
        height={isMd ? 12 : 10}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
      </svg>
      {meta.key}
    </span>
  );
}
