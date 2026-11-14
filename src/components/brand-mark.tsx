/**
 * العلامة الميكروية الموحدة للمنصة — حرف الكاف الهندسي والخط (شعار «كلام له لازمة» الأصلي).
 * SVG متزامن خفيف لا يضيف أي طلب شبكة، ويحافظ على نفس المقاسات في الهيدر والنوافذ.
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
      {/* حرف الكاف الهندسي الأصلي */}
      <path
        d="M95 30 L67 43 Q56 48.5 62 58 L75 76 Q82 88 68 88 L29 88"
        stroke={color}
        strokeWidth="10.5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      {/* خط اللازمة السفلي */}
      <path
        d="M81 116 L47 116"
        stroke={color}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
