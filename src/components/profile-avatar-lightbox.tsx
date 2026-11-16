"use client";

import { useEffect, useState } from "react";
import { getAvatarFrameMeta } from "@/lib/avatar-frames";

export function ProfileAvatarLightbox({
  src,
  alt,
  frameId,
}: {
  src: string;
  alt: string;
  frameId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const frame = getAvatarFrameMeta(frameId);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="عرض الصورة الشخصية كاملة"
        title="اضغط لعرض الصورة كاملة"
        className="group relative inline-flex cursor-zoom-in rounded-full p-[4px] transition-transform hover:scale-[1.03] focus:outline-hidden focus-visible:ring-2"
        style={{
          background: frame.ringBackground,
          boxShadow: frame.ringGlow,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="h-22 w-22 rounded-full object-cover ring-2 ring-(--surface)"
          style={{ background: "var(--surface)" }}
        />
        {frame.badgeChar && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold text-white shadow-soft"
            style={{ background: frame.badgeBg ?? "var(--accent)", borderColor: "var(--surface)" }}
          >
            {frame.badgeChar}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`صورة ${alt}`}
          className="fixed inset-0 z-90 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق معاينة الصورة"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82dvh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
