"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AVATAR_FRAMES,
  isFrameUnlocked,
  type AvatarFrameId,
} from "@/lib/avatar-frames";

export function AvatarFramePickerCard({
  avatarUrl,
  fallbackLetter,
  initialFrame,
  impactScore,
  isVerified,
  isVip,
}: {
  avatarUrl: string | null;
  fallbackLetter: string;
  initialFrame: string | null;
  impactScore: number;
  isVerified: boolean;
  isVip: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AvatarFrameId>(
    (AVATAR_FRAMES.find((f) => f.id === initialFrame)?.id ?? "none") as AvatarFrameId,
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (frameId: AvatarFrameId) => {
    if (saving || frameId === selected) return;
    if (!isFrameUnlocked(frameId, { impactScore, isVerified, isVip })) return;
    const prev = selected;
    setSelected(frameId);
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarFrame: frameId === "none" ? null : frameId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSelected(prev);
        setStatus({ ok: false, text: data?.error || "تعذر حفظ الإطار" });
        return;
      }
      setStatus({ ok: true, text: "حُفظ إطار صورتك الشخصية" });
      router.refresh();
    } catch {
      setSelected(prev);
      setStatus({ ok: false, text: "انقطع الاتصال — أعد المحاولة" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 shadow-soft sm:p-6"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
          إطارات الصورة الشخصية
        </h2>
        {saving && (
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
            جارٍ الحفظ..
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        تُفتح الإطارات تلقائيًا مع تقدمك في الرتب ورصيد أثرك دون أي خصم من نقاطك.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AVATAR_FRAMES.map((frame) => {
          const unlocked = isFrameUnlocked(frame.id, { impactScore, isVerified, isVip });
          const active = selected === frame.id;
          return (
            <button
              key={frame.id}
              type="button"
              disabled={!unlocked || saving}
              onClick={() => void pick(frame.id)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-center transition-all ${
                unlocked ? "cursor-pointer hover:scale-[1.02] active:scale-[0.98]" : "cursor-not-allowed opacity-60"
              }`}
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active ? "var(--accent-soft)" : "var(--bg-soft)",
              }}
            >
              <span
                className="inline-flex rounded-full p-[3px]"
                style={{
                  background: frame.ringBackground,
                  boxShadow: frame.ringGlow,
                }}
              >
                {avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={avatarUrl}
                    alt={frame.name}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full object-cover"
                    style={{ background: "var(--surface)" }}
                  />
                ) : (
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold"
                    style={{ background: "var(--surface)", color: "var(--accent-strong)" }}
                  >
                    {fallbackLetter}
                  </span>
                )}
              </span>

              <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                {frame.name}
              </span>
              <span className="text-[10px] leading-4" style={{ color: unlocked ? "var(--accent-strong)" : "var(--ink-muted)" }}>
                {unlocked ? (active ? "مُفعَّل حاليًا" : "مفتوح") : frame.unlockHint}
              </span>
            </button>
          );
        })}
      </div>

      {status && (
        <p
          className="mt-3 rounded-xl px-4 py-2.5 text-xs font-bold leading-6"
          style={{
            background: status.ok ? "var(--accent-soft)" : "rgba(220,38,38,0.08)",
            color: status.ok ? "var(--accent-strong)" : "#DC2626",
          }}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
