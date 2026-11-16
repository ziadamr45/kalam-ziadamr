/**
 * ============================================================
 * منظومة إطارات الصورة الشخصية — بهوية وروح «كلام له لازمة»
 * ============================================================
 * تُفتح الإطارات تلقائيًا بالإنجازات والرتب الفكرية أو التوثيق،
 * دون المساس برصيد الأثر (impactScore) نهائيًا.
 */

export type AvatarFrameId =
  | "none"
  | "ink-calm"
  | "emerald-leaf"
  | "kalam-gold"
  | "royal-seal";

export type AvatarFrameMeta = {
  id: AvatarFrameId;
  name: string;
  unlockHint: string;
  minScore?: number;
  requiresPrivilegeOrScore?: number;
  ringBackground: string;
  ringGlow?: string;
  badgeChar?: string;
  badgeBg?: string;
};

export const AVATAR_FRAMES: AvatarFrameMeta[] = [
  {
    id: "none",
    name: "بلا إطار",
    unlockHint: "متاح للجميع منذ التسجيل",
    minScore: 0,
    ringBackground: "var(--accent-soft)",
  },
  {
    id: "ink-calm",
    name: "مداد هادئ",
    unlockHint: "يُفتح عند ٥٠ نقطة (رتبة محاور واعد)",
    minScore: 50,
    ringBackground: "linear-gradient(135deg, #e8c87e 0%, #c08a2d 48%, #734614 100%)",
    ringGlow: "0 0 0 2px rgba(192,138,45,0.22), 0 4px 14px -4px rgba(161,106,31,0.45)",
  },
  {
    id: "emerald-leaf",
    name: "غصن الزمرد",
    unlockHint: "يُفتح عند ١٥٠ نقطة (رتبة عقل رصين)",
    minScore: 150,
    ringBackground: "linear-gradient(135deg, #9ad9aa 0%, #3c7a4e 50%, #1e4d2b 100%)",
    ringGlow: "0 0 0 2px rgba(60,122,78,0.24), 0 4px 16px -4px rgba(60,122,78,0.45)",
  },
  {
    id: "kalam-gold",
    name: "تاج أهل الكلمة",
    unlockHint: "يُفتح عند ٣٥٠ نقطة (رتبة أهل الكلمة)",
    minScore: 350,
    ringBackground: "linear-gradient(135deg, #fff3c4 0%, #e6b84c 35%, #b87d1e 70%, #f5ebd3 100%)",
    ringGlow: "0 0 0 2px rgba(217,164,65,0.32), 0 6px 20px -4px rgba(217,164,65,0.58)",
    badgeChar: "✦",
    badgeBg: "#B87D1E",
  },
  {
    id: "royal-seal",
    name: "الختم الملكي",
    unlockHint: "لحاملي التوثيق الرسمي أو VIP أو ٥٠٠+ نقطة",
    requiresPrivilegeOrScore: 500,
    ringBackground: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 40%, #d9a441 85%, #fef08a 100%)",
    ringGlow: "0 0 0 2px rgba(124,58,237,0.3), 0 6px 22px -4px rgba(124,58,237,0.52)",
    badgeChar: "♛",
    badgeBg: "#6D28D9",
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
