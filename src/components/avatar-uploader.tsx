"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * مُحرِّر صورة الحساب — رفع سحابي مباشر بـ Cloudinary:
 * سحب وإفلات أو نقرة واحدة، معاينة لحظية، وتحسين تلقائي بصيغ الويب الحديثة.
 */
export function AvatarUploader({ currentImage }: { currentImage: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(currentImage);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("تُقبل الصور فقط (JPG / PNG / WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("الصورة أكبر من 8MB — اختر صورة أخف");
      return;
    }

    /* معاينة لحظية قبل انتهاء الرفع */
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setProgress(15);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      form.append("folder", "account");

      setProgress(45);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setProgress(80);
      if (!res.ok) {
        throw new Error(data?.error || "فشل الرفع");
      }

      const put = await fetch("/api/account/image", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: data.url }),
      });
      setProgress(100);
      if (!put.ok) {
        const pd = await put.json().catch(() => ({}));
        throw new Error(pd?.error || "تعذر تحديث الصورة");
      }

      router.refresh();
    } catch (err) {
      setPreview(currentImage);
      setError(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        disabled={busy}
        className={`group relative flex h-22 w-22 items-center justify-center overflow-hidden rounded-full border-4 transition-all ${
          dragging ? "scale-105 border-dashed" : ""
        } disabled:opacity-70`}
        style={{ borderColor: "var(--accent-soft)" }}
        title="انقر أو أفلِت صورة جديدة هنا — تُحسَّن تلقائيًا وتُرفع بأحدث صيغ الويب"
      >
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={preview} alt="صورة الحساب" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
            ?
          </span>
        )}
        {/* غطاء التغيير */}
        <span
          className="absolute inset-0 flex items-end justify-center bg-black/45 pb-2 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          {busy ? "جارٍ الرفع.." : "تغيير الصورة"}
        </span>
      </button>

      {/* شريط تقدم الرفع */}
      {progress > 0 && (
        <div className="h-1.5 w-28 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      )}

      {error && (
        <p className="text-center text-[11px] font-semibold" style={{ color: "#B4443C" }}>
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
