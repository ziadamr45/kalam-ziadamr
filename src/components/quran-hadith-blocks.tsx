import { toArabicDigits } from "@/lib/content-blocks";

/**
 * كتلة الآية القرآنية:
 * خط الرسم العثماني (Amiri Quran) + حاوية هادئة + أقواس قرآنية ﴿ ﴾
 * + توثيق السورة والآية في هامش فرعي أنيق بالأرقام العربية.
 */
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
  const ayahNum = toArabicDigits(ayah.replace(/[^\d]/g, "") || ayah);
  return (
    <figure id={id} className="quran-block" dir="rtl">
      <span aria-hidden className="quran-ornament">
        ۞
      </span>
      <blockquote className="quran-text">
        <span className="quran-bracket" aria-hidden>
          ﴿
        </span>{" "}
        {text}{" "}
        <span className="quran-bracket" aria-hidden>
          ﴾
        </span>
      </blockquote>
      <figcaption className="quran-ref">
        سورة {sura} <span className="quran-ref-dot">•</span> الآية {ayahNum}
      </figcaption>
    </figure>
  );
}

/**
 * كتلة الحديث النبوي الشريف:
 * خط نسخ كلاسيكي رصين (Noto Naskh Arabic / Amiri) + إطار ناعم
 * + أقواس اقتباس راقية + اسم الراوي والتخريج في سطر فرعي هادئ.
 */
export function HadithBlock({
  id,
  text,
  narrator,
}: {
  id: string;
  text: string;
  narrator: string;
}) {
  return (
    <figure id={id} className="hadith-block" dir="rtl">
      <blockquote className="hadith-text">
        <span className="hadith-bracket" aria-hidden>
          «
        </span>{" "}
        {text}{" "}
        <span className="hadith-bracket" aria-hidden>
          »
        </span>
      </blockquote>
      <figcaption className="hadith-ref">{narrator}</figcaption>
    </figure>
  );
}
