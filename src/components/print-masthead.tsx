"use client";

import { QRCodeSVG } from "qrcode.react";
import { BrandMark } from "@/components/brand-mark";

/**
 * ============================================================
 * ترويسة الطباعة الرسمية — تظهر في نسخة الورق/PDF حصريًا
 * ============================================================
 * رمز QR متجهي نقي (SVG) وشعار الكاف المتجهي يرسمهما محرك المتصفح
 * نفسه (Blink/WebKit بمحرك HarfBuzz) — لا صورة شبكية ولا نداء شبكي،
 * فيخرج في ملف الـ PDF بدقة المتجهات الكاملة ولا يسقط أبدًا كمربع أبيض.
 */
export function PrintMasthead({ url }: { url: string }) {
  return (
    <div className="print-only print-masthead" aria-hidden>
      <div className="print-masthead-row">
        <div className="print-masthead-brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <BrandMark size={28} />
          <div>
            <p className="print-masthead-title">كلام له لازمة</p>
            <p className="print-masthead-sub">منصة فكرية واعية — بلا ضجيج، بلا إعلانات</p>
          </div>
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
