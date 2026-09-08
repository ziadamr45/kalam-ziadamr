"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { displayName, validateCustomName, validateBio } from "@/lib/identity";

/**
 * ============================================================
 * محرّر الهوية المعروضة — استقلالية القارئ عن بيانات Google
 * ============================================================
 * - تعديل الاسم المعروض مع فحص فوري لمنع الأسماء المسيئة أو الفارغة.
 * - رفع صورة شخصية مباشر ومتكامل مع Cloudinary (من الهاتف أو الكمبيوتر).
 * - استرجاع صورة Google الأصلية بنقرة زر واحدة.
 * - زر حفظ موحّد بتنبيه فوري بالنجاح أو الخطأ.
 * بيانات التوثيق الأصلية (email/googleId) لا تُمس إطلاقًا.
 */

type Initial = { customName: string | null; customImage: string | null; bio: string | null };

export function ProfileEditor({
  googleName,
  googleImage,
  initial,
}: {
  googleName: string | null;
  googleImage: string | null;
  initial: Initial;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(initial.customName ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial.customImage);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const currentAvatar = imageUrl || googleImage;
  const nameError = name.trim() ? validateCustomName(name) : null;
  const bioError = bio.trim() ? validateBio(bio) : null;
  const dirty =
    name.trim() !== (initial.customName ?? "") ||
    bio.trim() !== (initial.bio ?? "") ||
    (imageUrl ?? "") !== (initial.customImage ?? "");

  const uploadAvatar = async (file: File) => {
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setMessage({ ok: false, text: "تُقبل الصور فقط (JPG / PNG / WebP)" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage({ ok: false, text: "الصورة أكبر من 8MB — اختر صورة أخف" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      form.append("folder", "account");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data?.error || "فشل الرفع السحابي");
      setImageUrl(data.url as string);
      setMessage({ ok: true, text: "رُفعت الصورة — اضغط «حفظ التغييرات» لتثبيتها" });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر رفع الصورة" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (nameError || bioError) {
      setMessage({ ok: false, text: nameError ?? (bioError as string) });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customName: name.trim() || null,
          customImage: imageUrl,
          bio: bio.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error || "تعذر حفظ التغييرات" });
        return;
      }
      setMessage({ ok: true, text: "حُفظت هويتك المعروضة — تظهر الآن في كل أركان المنصة" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "انقطع الاتصال — أعد المحاولة" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-3xl border p-6 shadow-soft sm:p-8"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="font-ui mb-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
        هويتي المعروضة
      </h2>
      <p className="mb-6 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        تسجيل الدخول عبر Google بوابة توثيق وأمان فقط — أما اسمك وصورتك أمام القرّاء فأنت صاحب القرار فيها.
      </p>

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* ==================== الصورة الرمزية ==================== */}
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
              if (file) uploadAvatar(file);
            }}
            disabled={uploading}
            className={`group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 transition-all ${
              dragging ? "scale-105 border-dashed" : ""
            } disabled:opacity-70`}
            style={{ borderColor: "var(--accent-soft)" }}
            title="انقر أو أفلِت صورتك هنا — تُحسَّن تلقائيًا وتُرفع بأحدث صيغ الويب"
          >
            {currentAvatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentAvatar}
                alt="صورتي الشخصية"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-3xl font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {displayName({ customName: name, name: googleName }).charAt(0)}
              </span>
            )}
            <span className="absolute inset-0 flex items-end justify-center bg-black/45 pb-2 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? "جارٍ الرفع.." : "تغيير الصورة"}
            </span>
          </button>

          {/* استرجاع صورة Google الأصلية بنقرة واحدة */}
          {imageUrl && (
            <button
              type="button"
              onClick={() => {
                setImageUrl(null);
                setMessage({ ok: true, text: "ستعود صورة Google الأصلية بعد الحفظ" });
              }}
              className="text-[11px] font-bold underline-offset-2 hover:underline"
              style={{ color: "var(--accent-strong)" }}
            >
              استرجاع صورة Google الأصلية
            </button>
          )}
          <p className="text-center text-[10px] leading-5" style={{ color: "var(--ink-muted)" }}>
            {imageUrl ? "صورة مخصصة (Cloudinary)" : googleImage ? "صورة Google الحالية" : "لا صورة بعد"}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* ==================== الاسم والنبذة ==================== */}
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <label htmlFor="custom-name" className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
              الاسم المعروض للقرّاء
            </label>
            <input
              id="custom-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMessage(null);
              }}
              maxLength={40}
              placeholder={googleName || "اكتب اسمك كما تريد أن يقرؤه الناس"}
              className="w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--accent)]"
              style={{
                borderColor: nameError ? "#DC2626" : "var(--border)",
                color: "var(--ink)",
              }}
            />
            <p className="mt-1.5 text-[11px]" style={{ color: nameError ? "#DC2626" : "var(--ink-muted)" }}>
              {nameError ?? (googleName ? `اسم Google الأصلي: ${googleName}` : "حرفان حتى 40 حرفًا")}
            </p>
          </div>

          <div>
            <label htmlFor="custom-bio" className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink)" }}>
              نبذتك الفكرية <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>(اختيارية)</span>
            </label>
            <textarea
              id="custom-bio"
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setMessage(null);
              }}
              rows={3}
              maxLength={200}
              placeholder="عبارة مقتضبة تعبّر عنك — «أقرأ ل أفهم» مثلًا"
              className="w-full resize-none rounded-xl border bg-transparent px-4 py-3 text-sm leading-7 outline-none transition-colors focus:border-[var(--accent)]"
              style={{
                borderColor: bioError ? "#DC2626" : "var(--border)",
                color: "var(--ink)",
              }}
            />
            <p className="mt-1.5 flex justify-between text-[11px]" style={{ color: bioError ? "#DC2626" : "var(--ink-muted)" }}>
              <span>{bioError ?? "تظهر في بطاقة ملفك الشخصي"}</span>
              <span>{bio.length}/200</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || uploading || (!dirty && !message)}
              className="rounded-full px-6 py-2.5 text-sm font-bold shadow-soft transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {busy ? "جارٍ الحفظ.." : "حفظ التغييرات"}
            </button>
            {dirty && !busy && (
              <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                لديك تغييرات غير محفوظة
              </span>
            )}
          </div>

          {message && (
            <p
              className="rounded-xl px-4 py-3 text-xs font-bold leading-6"
              style={{
                background: message.ok ? "var(--accent-soft)" : "rgba(220,38,38,0.08)",
                color: message.ok ? "var(--accent-strong)" : "#DC2626",
              }}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
