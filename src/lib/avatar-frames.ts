/**
 * ============================================================
 * منظومة إطارات الصورة الشخصية — بهوية وروح «كلام له لازمة»
 * ============================================================
 * تُفتح الإطارات تلقائيًا بالإنجازات والرتب الفكرية أو التوثيق،
 * دون المساس برصيد الأثر (impactScore) نهائيًا.
 */

export type AvatarFrameId =
  | "none"
  | "satr-bidaya"
  | "ink-calm"
  | "emerald-leaf"
  | "kalam-lazma"
  | "kalam-gold"
  | "hibr-asala"
  | "royal-seal";

export type AvatarFrameBadgeKind = "kaf" | "diamond" | "seal";

export type AvatarFrameMeta = {
  id: AvatarFrameId;
  name: string;
  unlockHint: string;
  minScore?: number;
  requiresPrivilegeOrScore?: number;
  ringBackground: string;
  ringGlow?: string;
  badgeKind?: AvatarFrameBadgeKind;
  badgeBg?: string;
};

export const AVATAR_FRAMES: AvatarFrameMeta[] = [
  {
    id: "none",
    name: "بلا إطار",
    unlockHint: "متاح لك منذ التسجيل",
    minScore: 0,
    ringBackground: "var(--accent-soft)",
  },
  {
    id: "satr-bidaya",
    name: "سطرك الأول",
    unlockHint: "يُفتح عند ٢٥ نقطة أثر",
    minScore: 25,
    ringBackground: "linear-gradient(135deg, #d6cfc2 0%, #9b8e7b 55%, #6f6556 100%)",
    ringGlow: "0 0 0 2px rgba(155,142,123,0.18), 0 3px 10px -4px rgba(111,101,86,0.35)",
  },
  {
    id: "ink-calm",
    name: "مدادك الرصين",
    unlockHint: "يُفتح عند ٥٠ نقطة (محاور واعد)",
    minScore: 50,
    ringBackground: "linear-gradient(135deg, #e8c87e 0%, #c08a2d 48%, #734614 100%)",
    ringGlow: "0 0 0 2px rgba(192,138,45,0.22), 0 4px 14px -4px rgba(161,106,31,0.45)",
  },
  {
    id: "emerald-leaf",
    name: "غصن أثرك",
    unlockHint: "يُفتح عند ١٥٠ نقطة (عقل رصين)",
    minScore: 150,
    ringBackground: "linear-gradient(135deg, #9ad9aa 0%, #3c7a4e 50%, #1e4d2b 100%)",
    ringGlow: "0 0 0 2px rgba(60,122,78,0.24), 0 4px 16px -4px rgba(60,122,78,0.45)",
  },
  {
    id: "kalam-lazma",
    name: "كلمتك لها لازمة",
    unlockHint: "يُفتح عند ٢٥٠ نقطة أثر",
    minScore: 250,
    ringBackground: "linear-gradient(135deg, #f5ebd3 0%, #a16a1f 45%, #1c1917 100%)",
    ringGlow: "0 0 0 2px rgba(161,106,31,0.28), 0 5px 18px -4px rgba(132,83,27,0.5)",
    badgeKind: "kaf",
    badgeBg: "#84531B",
  },
  {
    id: "kalam-gold",
    name: "منارة فكرك",
    unlockHint: "يُفتح عند ٣٥٠ نقطة (أهل الكلمة)",
    minScore: 350,
    ringBackground: "linear-gradient(135deg, #fff3c4 0%, #e6b84c 35%, #b87d1e 70%, #f5ebd3 100%)",
    ringGlow: "0 0 0 2px rgba(217,164,65,0.34), 0 6px 20px -4px rgba(217,164,65,0.58)",
    badgeKind: "diamond",
    badgeBg: "#B87D1E",
  },
  {
    id: "hibr-asala",
    name: "حبر أصالتك",
    unlockHint: "يُفتح عند ٥٠٠ نقطة أثر",
    minScore: 500,
    ringBackground: "linear-gradient(135deg, #d9a441 0%, #6b431c 50%, #292524 100%)",
    ringGlow: "0 0 0 2px rgba(107,67,28,0.32), 0 6px 20px -4px rgba(28,25,23,0.48)",
    badgeKind: "kaf",
    badgeBg: "#292524",
  },
  {
    id: "royal-seal",
    name: "ختم ثقتك",
    unlockHint: "لحاملي التوثيق الرسمي أو VIP أو ٧٠٠+ نقطة",
    requiresPrivilegeOrScore: 700,
    ringBackground: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 40%, #d9a441 85%, #fef08a 100%)",
    ringGlow: "0 0 0 2px rgba(124,58,237,0.3), 0 6px 22px -4px rgba(124,58,237,0.52)",
    badgeKind: "seal",
    badgeBg: "#5B21B6",
  },
];

export function getAvatarFrameMeta(id: string | null | undefined): AvatarFrameMeta {
  return AVATAR_FRAMES.find((f) => f.id === id) ?? AVATAR_FRAMES[0];
}

export function isFrameUnlocked(
  frameId: string | null | undefined,
  user: { impactScore: number; isVerified?: boolean; isVip?: boolean },
): boolean {
  const frame = AVATAR_FRAMES.find((f) => f.id === frameId);
  if (!frame) return false;
  if (frame.id === "none") return true;
  if (typeof frame.requiresPrivilegeOrScore === "number") {
    return Boolean(user.isVerified || user.isVip || user.impactScore >= frame.requiresPrivilegeOrScore);
  }
  return user.impactScore >= (frame.minScore ?? 0);
}
