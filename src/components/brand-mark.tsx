/**
 * العلامة الميكروية للمنصة — الكشيدة النحاسية المستوحاة من أيقونة المنصة،
 * تندمج عضويًا مع كتابة «كلام له لازمة» في موضع العلامة التجارية فقط.
 * SVG متزامن خفيف لا يضيف أي طلب شبكة — Micro-branding بلا حشو.
 */
export function BrandMark({ size = 18, muted = false }: { size?: number; muted?: boolean }) {
  const copper = muted ? "var(--ink-muted)" : "var(--accent)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      {/* الكشيدة الصاعدة — ضربة الأثر */}
      <path
        d="M10 34 L34 12"
        stroke={copper}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* الخط القاعدي */}
      <path
        d="M8 41 L26 41"
        stroke={copper}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* نقطة اللازمة */}
      <circle cx="36" cy="41" r="3.4" fill={copper} />
    </svg>
  );
}
