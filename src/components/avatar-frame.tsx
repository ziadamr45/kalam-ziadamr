import { getAvatarFrameMeta, type AvatarFrameBadgeKind } from "@/lib/avatar-frames";

export function FrameGlyph({ kind, size = 12 }: { kind: AvatarFrameBadgeKind; size?: number }) {
  if (kind === "kaf") {
    return (
      <svg width={size} height={size} viewBox="16 14 96 112" fill="none" aria-hidden>
        <path
          d="M98 25.5 L98 36.8 L72 48 C68.2 49.8 68.5 52.8 71.8 57.2 L83.5 72.5 C87.8 78.2 86 95 74 95 L28 95 L28 84.3 L70.8 84.3 C75.5 84.3 76.2 78.8 72.8 74 L60.2 56.8 C55.8 50.6 57.2 42.5 65 39 Z"
          fill="currentColor"
        />
        <path d="M80.5 120.5 L46.5 120.5" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "diamond") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l6.5 9L12 21 5.5 12 12 3z" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l8 4v6c0 5-3.4 9.3-8 10-4.6-.7-8-5-8-10V6l8-4z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function FramedAvatar({
  src,
  alt,
  fallbackLetter,
  frameId,
  size = "lg",
}: {
  src?: string | null;
  alt: string;
  fallbackLetter: string;
  frameId?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const frame = getAvatarFrameMeta(frameId);
  const dimClass =
    size === "sm"
      ? "h-9 w-9 text-sm"
      : size === "md"
        ? "h-12 w-12 text-base"
        : "h-22 w-22 text-3xl";
  const padClass = size === "sm" ? "p-[2.5px]" : size === "md" ? "p-[3.5px]" : "p-[4px]";
  const ringClass = size === "sm" ? "ring-[1.5px] ring-(--surface)" : "ring-2 ring-(--surface)";
  const badgeClass =
    size === "sm"
      ? "h-4 w-4 -bottom-0.5 -right-0.5 border"
      : size === "md"
        ? "h-4.5 w-4.5 -bottom-0.5 -right-0.5 border"
        : "h-6 w-6 -bottom-0.5 -right-0.5 border-2";
  const glyphSize = size === "sm" ? 8 : size === "md" ? 9 : 12;

  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full ${padClass}`}
      style={{
        background: frame.ringBackground,
        boxShadow: frame.ringGlow,
      }}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          draggable={false}
          className={`${dimClass} ${ringClass} rounded-full object-cover`}
          style={{ background: "var(--surface)" }}
        />
      ) : (
        <span
          className={`${dimClass} ${ringClass} flex items-center justify-center rounded-full font-bold`}
          style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
        >
          {fallbackLetter}
        </span>
      )}
      {frame.badgeKind && (
        <span
          aria-hidden
          className={`absolute ${badgeClass} flex items-center justify-center rounded-full text-white shadow-soft`}
          style={{ background: frame.badgeBg ?? "var(--accent)", borderColor: "var(--surface)" }}
        >
          <FrameGlyph kind={frame.badgeKind} size={glyphSize} />
        </span>
      )}
    </span>
  );
}
