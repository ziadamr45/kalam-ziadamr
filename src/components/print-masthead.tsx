"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * ============================================================
 * ترويسة الطباعة الرسمية — تظهر في نسخة الورق/PDF حصريًا
 * ============================================================
 * رمز QR متجهي نقي (SVG) يرسمه محرك المتصفح نفسه (Blink/WebKit
 * بمحرك HarfBuzz) — لا صورة شبكية ولا نداء شبكي، فيخرج في ملف
 * الـ PDF بدقة المتجهات الكاملة ولا يسقط أبدًا كمربع أبيض.
 * هذه الترويسة جزء من قالب الطباعة الأصيل: النص الذي تراه على
 * الشاشة هو نفسه حرفيًا ما يخرج على الورق — صفر إعادة رسم برمجية.
 */
export function PrintMasthead({ url }: { url: string }) {
  return (
    <div className="print-only print-masthead" aria-hidden>
      <div className="print-masthead-row">
        <div className="print-masthead-brand">
          <p className="print-masthead-title">كلام له لازمة</p>
          <p className="print-masthead-sub">منصة فكرية واعية — بلا ضجيج، بلا إعلانات</p>
        </div>
        <div className="print-masthead-qr">
          <QRCodeSVG level="M" size={64} value={url} marginSize={1} />
        </div>
      </div>
      <p className="print-masthead-caption">
        امسح الرمز للنسخة التفاعلية والاستماع للتسجيل الصوتي الكامل
      </p>
    </div>
  );
}
