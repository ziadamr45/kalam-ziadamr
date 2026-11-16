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
  const [showGuide, setShowGuide] = useState(false);
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
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
              جارٍ الحفظ..
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors hover:bg-(--accent-soft)"
            style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            كيف تُفتح الإطارات؟
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        تُفتح الإطارات تلقائيًا مع تقدمك في الرتب ورصيد أثرك دون أي خصم من نقاطك.
      </p>

      {showGuide && (
        <div
          className="mt-3 rounded-2xl border p-4 text-xs leading-6"
          style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--ink)" }}
        >
          <p className="font-bold" style={{ color: "var(--accent-strong)" }}>
            متى يُفتح كل إطار؟
          </p>
          <ul className="mt-2 space-y-1.5 text-[11px]" style={{ color: "var(--ink-muted)" }}>
            <li>• <strong style={{ color: "var(--ink)" }}>بلا إطار:</strong> متاح للجميع منذ التسجيل.</li>
            <li>• <strong style={{ color: "var(--ink)" }}>مداد هادئ:</strong> يُفتح تلقائيًا عند بلوغ ٥٠ نقطة أثر (رتبة «محاور واعد»).</li>
            <li>• <strong style={{ color: "var(--ink)" }}>غصن الزمرد:</strong> يُفتح تلقائيًا عند بلوغ ١٥٠ نقطة أثر (رتبة «عقل رصين»).</li>
            <li>• <strong style={{ color: "var(--ink)" }}>تاج أهل الكلمة:</strong> يُفتح تلقائيًا عند بلوغ ٣٥٠ نقطة أثر (رتبة «أهل الكلمة»).</li>
            <li>• <strong style={{ color: "var(--ink)" }}>الختم الملكي:</strong> يُفتح لحاملي التوثيق الرسمي أو العضوية المميزة VIP أو عند بلوغ ٥٠٠+ نقطة أثر.</li>
          </ul>
          <p className="mt-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
            كل الإطارات مجانية وتقديرية — التبديل بينها لا يخصم أي نقطة من رصيد أثرك.
          </p>
        </div>
      )}

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
                className="relative inline-flex rounded-full p-[3.5px]"
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
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-(--surface)"
                    style={{ background: "var(--surface)" }}
                  />
                ) : (
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold ring-2 ring-(--surface)"
                    style={{ background: "var(--surface)", color: "var(--accent-strong)" }}
                  >
                    {fallbackLetter}
                  </span>
                )}
                {frame.badgeChar && (
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px] font-bold text-white"
                    style={{ background: frame.badgeBg ?? "var(--accent)", borderColor: "var(--surface)" }}
                  >
                    {frame.badgeChar}
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
