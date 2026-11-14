/**
 * العلامة الميكروية الموحدة للمنصة — حرف الكاف الهندسي الأصلي والشرطة السفلية.
 * مسار مغلق (fill) بحواف مقطوعة بدقة مطابقة للشعار الرسمي في /icons/icon-192.png.
 */
export function BrandMark({
  size = 18,
  muted = false,
  inheritColor = false,
}: {
  size?: number;
  muted?: boolean;
  inheritColor?: boolean;
}) {
  const color = inheritColor
    ? "currentColor"
    : muted
      ? "var(--ink-muted)"
      : "var(--accent)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      {/* حرف الكاف الهندسي الأصلي بحواف مقطوعة */}
      <path
        d="M98 25 L98 37 L67 51 Q64 52.5 66 55 L82 81 Q87 95 72 95 L28 95 L28 84 L69 84 Q72 84 70 81 L55 56 Q49 44 61 39 Z"
        fill={color}
      />
      {/* خط اللازمة السفلي */}
      <path
        d="M81 118 L47 118"
        stroke={color}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
