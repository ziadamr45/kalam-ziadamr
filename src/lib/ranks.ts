/**
 * ============================================================
 * منظومة الرتب والألقاب الفكرية — «رصيد الأثر»
 * ============================================================
 * الرتبة تُحتسب آليًا من إجمالي رصيد الأثر، وتُعرض شارتها
 * بجوار اسم القارئ في كل مشاركاته وتعليقاته وصفحته الشخصية.
 *
 * 0–49: قارئ متأمل | 50–149: محاور واعد | 150–349: عقل رصين | 350+: أهل الكلمة
 */

export type RankMeta = {
  key: string;
  min: number;
  /** لون الشارة — ناعم يتناغم مع هوية المنصة النحاسية */
  color: string;
  /** خلفية ناعمة مشتقة من اللون */
  soft: string;
  /** وصف قصير يظهر في صفحة الملف الشخصي */
  hint: string;
};

export const RANKS: RankMeta[] = [
  {
    key: "قارئ متأمل",
    min: 0,
    color: "#7C7468",
    soft: "rgba(124,116,104,0.12)",
    hint: "تقرأ بتأنٍّ وتستوعب قبل أن تتكلم",
  },
  {
    key: "محاور واعد",
    min: 50,
    color: "#3C7A4E",
    soft: "rgba(60,122,78,0.12)",
    hint: "كلامك في الحوار بدأ يصنع أثره",
  },
  {
    key: "عقل رصين",
    min: 150,
    color: "#A16A1F",
    soft: "rgba(161,106,31,0.13)",
    hint: "موازنك في النقاش أصبح امتيازًا",
  },
  {
    key: "أهل الكلمة",
    min: 350,
    color: "#8A5A14",
    soft: "rgba(138,90,20,0.16)",
    hint: "أعلى رتبة فكرية — كلمتك لها وزن خاص عند صاحب المنصة",
  },
];

/** الرتبة المستحقة لإجمالي رصيد معين */
export function rankForScore(score: number): string {
  let rank = RANKS[0].key;
  for (const r of RANKS) if (score >= r.min) rank = r.key;
  return rank;
}

/** بيانات شارة رتبة نصية (مع حماية من قيمة قديمة غير معروفة) */
export function rankMeta(rank: string | null | undefined): RankMeta {
  return RANKS.find((r) => r.key === rank) ?? RANKS[0];
}

/**
 * حصة محاورة الذكاء الاصطناعي لكل مقال — تتمدد مع ترقية الرتبة
 * (ميزة الرصيد المرتفع: «عقل رصين» و«أهل الكلمة» يحصلون على رسائل أكثر)
 */
export const AI_QUOTA_BY_RANK: Record<string, number> = {
  "قارئ متأمل": 6,
  "محاور واعد": 6,
  "عقل رصين": 9,
  "أهل الكلمة": 12,
};

export const AI_QUOTA_BASE = 6;

export function aiQuotaForScore(score: number): number {
  return AI_QUOTA_BY_RANK[rankForScore(score)] ?? AI_QUOTA_BASE;
}

/** هل الرتبة تتيح إرسال مقترحات خاصة للأدمن؟ (ميزة «أهل الكلمة» حصريًا) */
export function canSendProposals(rank: string | null | undefined): boolean {
  return rank === "أهل الكلمة";
}
