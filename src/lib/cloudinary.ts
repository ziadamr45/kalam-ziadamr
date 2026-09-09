/**
 * تكامل Cloudinary — يعمل حصريًا على السيرفر، سرّ الـ API لا يقترب من المتصفح.
 * تُخزن الصور بصيغ الويب الحديثة (WebP/AVIF) تلقائيًا عبر f_auto,q_auto
 * فيكبف الرفع سرعة المنصة دون أي ضغط يدوي.
 */

import "server-only";

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

export const cloudinaryConfigured = Boolean(CLOUD && KEY && SECRET && !CLOUD.startsWith("PLACEHOLDER"));

/** توقيع الرفع (SHA-1 لمعاملات مرتبة أبجديًا + السر) وفق وثائق Cloudinary */
async function makeSignature(params: Record<string, string>): Promise<string> {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const raw = `${sorted}${SECRET}`;
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type UploadResult = {
  url: string; // رابط التسليم المحسّن (f_auto,q_auto → WebP/AVIF)
  rawUrl: string; // رابط الأصل
  width: number | null;
  height: number | null;
  bytes: number;
};

/** رفع صورة إلى Cloudinary وإرجاع روابطها المحسّنة */
export async function uploadImage(
  file: Blob,
  filename: string,
  folder = "kalam",
): Promise<UploadResult> {
  if (!cloudinaryConfigured) {
    throw new Error("خدمة الصور غير مهيأة — أضف مفاتيح Cloudinary في متغيرات البيئة");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string> = { folder, timestamp: String(timestamp) };
  const signature = await makeSignature(params);

  const form = new FormData();
  form.append("file", file, filename);
  form.append("api_key", KEY!);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`فشل رفع الصورة إلى التخزين السحابي (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    secure_url: string;
    width: number;
    height: number;
    bytes: number;
    public_id: string;
    version: number;
  };

  /* رابط التسليم المحسّن: إدراج f_auto,q_auto بعد upload/ ليعطي WebP/AVIF حسب المتصفح */
  const rawUrl = data.secure_url;
  const url = rawUrl.replace("/upload/", "/upload/f_auto,q_auto/");

  return {
    url,
    rawUrl,
    width: data.width ?? null,
    height: data.height ?? null,
    bytes: data.bytes ?? 0,
  };
}

/** استخراج public_id من رابط Cloudinary — لتنظيف أصول المستخدم عند محو حسابه
 *  https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto/v123/kalam/accounts/x.jpg → kalam/accounts/x */
export function publicIdFromCloudinaryUrl(url: string | null | undefined): string | null {
  if (!url || !url.includes("res.cloudinary.com")) return null;
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at < 0) return null;
  let tail = url.slice(at + marker.length).split("?")[0];
  const segments = tail.split("/");
  /* إسقاط أجزاء التحويل وجزء الإصدار من المقدمة */
  while (segments.length > 0 && (/^v\d+$/.test(segments[0]) || segments[0].includes(",") || segments[0].includes("="))) {
    segments.shift();
  }
  tail = segments.join("/");
  tail = tail.replace(/\.[a-z0-9]{2,5}$/i, "");
  return tail || null;
}

/** حذف صورة من Cloudinary (تنظيف أصول الحساب عند المحو) — لا يُسقط العملية أبدًا */
export async function destroyCloudinaryImage(
  publicId: string,
): Promise<{ deleted: boolean; result: string }> {
  if (!cloudinaryConfigured) return { deleted: false, result: "not_configured" };
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const params: Record<string, string> = { public_id: publicId, timestamp: String(timestamp) };
    const signature = await makeSignature(params);
    const form = new FormData();
    form.append("api_key", KEY!);
    form.append("timestamp", String(timestamp));
    form.append("public_id", publicId);
    form.append("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
      method: "POST",
      body: form,
    });
    const d = (await res.json().catch(() => ({}))) as { result?: string };
    return { deleted: d.result === "ok", result: d.result ?? `http_${res.status}` };
  } catch {
    return { deleted: false, result: "error" };
  }
}
