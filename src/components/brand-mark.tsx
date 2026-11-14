/**
 * العلامة الميكروية الموحدة للمنصة — حرف الكاف الهندسي الأصلي المحدد والشرطة السفلية.
 * مطابقة تمامًا لنسخة الشعار المعتمدة بانحناءات دائرية ناعمة وتحديد خفيف بارز.
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
      style={{
        flexShrink: 0,
        filter: "drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.18))",
      }}
    >
      <path
        d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
        fill={color}
      />
      <path
        d="M80.5 120.5 L46.5 120.5"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
