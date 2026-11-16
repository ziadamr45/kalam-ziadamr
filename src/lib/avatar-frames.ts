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
};

export const AVATAR_FRAMES: AvatarFrameMeta[] = [
  {
    id: "none",
    name: "بلا إطار",
    unlockHint: "متاح للجميع",
    minScore: 0,
    ringBackground: "var(--accent-soft)",
  },
  {
    id: "ink-calm",
    name: "مداد هادئ",
    unlockHint: "يُفتح عند ٥٠ نقطة (محاور واعد)",
    minScore: 50,
    ringBackground: "linear-gradient(135deg, #c08a2d, #84531b)",
    ringGlow: "0 0 0 2px rgba(161,106,31,0.16)",
  },
  {
    id: "emerald-leaf",
    name: "غصن الزمرد",
    unlockHint: "يُفتح عند ١٥٠ نقطة (عقل رصين)",
    minScore: 150,
    ringBackground: "linear-gradient(135deg, #3c7a4e, #7bb686)",
    ringGlow: "0 0 0 2px rgba(60,122,78,0.18)",
  },
  {
    id: "kalam-gold",
    name: "تاج أهل الكلمة",
    unlockHint: "يُفتح عند ٣٥٠ نقطة (أهل الكلمة)",
    minScore: 350,
    ringBackground: "linear-gradient(135deg, #f5ebd3, #d9a441, #84531b)",
    ringGlow: "0 2px 10px -2px rgba(217,164,65,0.45)",
  },
  {
    id: "royal-seal",
    name: "الختم الملكي",
    unlockHint: "لحاملي التوثيق أو التمييز أو ٥٠٠+ نقطة",
    requiresPrivilegeOrScore: 500,
    ringBackground: "linear-gradient(135deg, #7c3aed, #d9a441)",
    ringGlow: "0 2px 10px -2px rgba(124,58,237,0.38)",
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
