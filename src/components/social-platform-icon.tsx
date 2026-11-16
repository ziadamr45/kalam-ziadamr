import type { SocialLinkKey } from "@/lib/verification-meta";

export function SocialPlatformIcon({
  platform,
  size = 13,
}: {
  platform: SocialLinkKey;
  size?: number;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };

  switch (platform) {
    case "website":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...props}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...props}>
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case "threads":
      return (
        <svg {...props}>
          <path d="M19 12a7 7 0 1 0-2.6 5.45" />
          <path d="M15.5 12c0-2.5-1.5-4-3.5-4s-3.5 1.5-3.5 4 1.5 4 3.5 4c2.2 0 3.5-1.6 3.5-4V9.5c0-1.5 1-2.5 2.5-2.5" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...props}>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...props}>
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3v6Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...props}>
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      );
    case "snapchat":
      return (
        <svg {...props}>
          <path d="M12 3c-3 0-5 2.2-5 5.3 0 1.4.2 2.5-.8 3.2-.6.4-1.4.5-1.7.9-.3.4.3.9.9 1.1.8.3 1 .8.5 1.7-.7 1.2-2.1 1.8-3.4 2.1.6.8 2 1.2 3.3 1.4.5.1.8.5 1 1 .3.7.9 1.3 1.8 1.3.9 0 1.8-.6 3.4-.6s2.5.6 3.4.6c.9 0 1.5-.6 1.8-1.3.2-.5.5-.9 1-1 1.3-.2 2.7-.6 3.3-1.4-1.3-.3-2.7-.9-3.4-2.1-.5-.9-.3-1.4.5-1.7.6-.2 1.2-.7.9-1.1-.3-.4-1.1-.5-1.7-.9-1-.7-.8-1.8-.8-3.2C17 5.2 15 3 12 3Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M4 4l11.733 16h4.267l-11.733-16z" />
          <path d="M4 20l6.768-6.768m2.46-2.46L20 4" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...props}>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect width="4" height="12" x="2" y="9" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      );
    case "github":
      return (
        <svg {...props}>
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      );
    case "devto":
      return (
        <svg {...props}>
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <path d="M7 9v6" />
          <path d="M12 9v6" />
          <path d="M15 9l1.5 6L18 9" />
        </svg>
      );
  }
}
