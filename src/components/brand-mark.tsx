/**
 * العلامة الميكروية الموحدة للمنصة — حرف الكاف والخط (شعار «كلام له لازمة»).
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
      {/* جسم حرف الكاف */}
      <path
        d="M92 22 L92 66 Q92 84 70 84 L40 84 Q25 84 24 70"
        stroke={color}
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* شارة الكاف الداخلية */}
      <path
        d="M63 36 C53 36 49 44 57 47 C64 50 58 59 47 59"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* خط اللازمة أسفل الكاف */}
      <path
        d="M94 103 L34 103"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
      />
    </svg>
  );
}
