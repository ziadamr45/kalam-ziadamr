import { toArabicDigits } from "@/lib/content-blocks";

/**
 * كتلة الآية القرآنية:
 * خط الرسم العثماني (Amiri Quran) + حاوية هادئة + أقواس قرآنية ﴿ ﴾
 * + شارة توثيق السورة والآية في هامش فرعي أنيق بالأرقام العربية.
 * (تتحمل غياب السورة أو رقم الآية — تُعرض الشارة بما توفر فقط)
 */
/* منع تكرار الأقواس: إن وضع الكاتب الأقواس يدويًا داخل نصه
   فلا تُضاف أقواس الآية الزخرفية إطلاقًا */
const QURAN_BRACKET_GUARD = /[﴿﴾]/;

export function QuranBlock({
  id,
  text,
  sura,
  ayah,
}: {
  id: string;
  text: string;
  sura: string;
  ayah: string;
}) {
  const hasSura = Boolean(sura?.trim());
  const hasAyah = Boolean(ayah?.trim());
  const ayahNum = toArabicDigits((ayah || "").replace(/[^\d]/g, "") || ayah || "");
  const textHasBrackets = QURAN_BRACKET_GUARD.test(text);

  return (
    <figure id={id} className="quran-block" dir="rtl">
      <span aria-hidden className="quran-ornament">
        ۞
      </span>
      <blockquote className="quran-text">
        {!textHasBrackets && (
          <span className="quran-bracket" aria-hidden>
            ﴿
          </span>
        )}{" "}
        {text}{" "}
        {!textHasBrackets && (
          <span className="quran-bracket" aria-hidden>
            ﴾
          </span>
        )}
      </blockquote>
      {(hasSura || hasAyah) && (
        <figcaption className="quran-ref">
          {hasSura && <span>سورة {sura}</span>}
          {hasSura && hasAyah && <span className="quran-ref-dot">•</span>}
          {hasAyah && <span>الآية {ayahNum}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * كتلة الحديث النبوي الشريف:
 * خط نسخ كلاسيكي رصين (Amiri) + إطار ناعم + أقواس اقتباس راقية
 * + بادئة «قال رسول الله ﷺ:» لنسخة الوسم التوجيهي :::hadith
 * + اسم الراوي والتخريج في سطر فرعي هادئ في نهاية الكادر.
 * (حماية من التكرار: لا تُضاف البادئة إن وردت بالفعل في أول النص)
 */
const PREFIX_GUARD = /^\s*(قال\s*(رسول الله|نبي الله)|ﷺ)/;

/* منع تكرار الأقواس: كثير من الكتّاب يضعون « » يدويًا داخل نص الحديث —
   إن وُجدت في النص فلا تُضاف أقواس الاقتباس المرسومة إطلاقًا
   حتى لا تتشوه البنية ««هكذا»» بتكرار مزدوج */
const BRACKET_GUARD = /[«»]/;

export function HadithBlock({
  id,
  text,
  narrator,
  withPrefix = false,
}: {
  id: string;
  text: string;
  narrator: string;
  withPrefix?: boolean;
}) {
  const showPrefix = withPrefix && !PREFIX_GUARD.test(text);
  const textHasBrackets = BRACKET_GUARD.test(text);

  return (
    <figure id={id} className="hadith-block" dir="rtl">
      {showPrefix && (
        <span className="hadith-prefix">
          قال رسول الله <span className="hadith-saw">ﷺ</span>:
        </span>
      )}
      <blockquote className="hadith-text">
        {!textHasBrackets && (
          <span className="hadith-bracket" aria-hidden>
            «
          </span>
        )}{" "}
        {text}{" "}
        {!textHasBrackets && (
          <span className="hadith-bracket" aria-hidden>
            »
          </span>
        )}
      </blockquote>
      {narrator?.trim() && <figcaption className="hadith-ref">{narrator}</figcaption>}
    </figure>
  );
}
