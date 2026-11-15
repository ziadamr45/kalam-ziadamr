"use client";

import { useState } from "react";

/**
 * مركز تفضيلات الإشعارات — بطاقة مستقلة في تبويب «الإعدادات والتفضيلات».
 * يحفظ الاختيار تلقائيًا لحظة التبديل عبر PUT /api/profile.
 */

export function NotificationPreferencesCard({
  initial,
}: {
  initial: { pushNewArticles: boolean; impactAndReplies: boolean } | null;
}) {
  const [prefs, setPrefs] = useState({
    pushNewArticles: initial?.pushNewArticles !== false,
    impactAndReplies: initial?.impactAndReplies !== false,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = async (key: "pushNewArticles" | "impactAndReplies", checked: boolean) => {
    const prev = prefs;
    const next = { ...prefs, [key]: checked };
    setPrefs(next);
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefs(prev);
        setStatus({ ok: false, text: data?.error || "تعذر حفظ التفضيلات — أعد المحاولة" });
        return;
      }
      setStatus({ ok: true, text: "حُفظت تفضيلات الإشعارات" });
    } catch {
      setPrefs(prev);
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
          مركز تفضيلات الإشعارات
        </h2>
        {saving && (
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
            جارٍ الحفظ..
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        اختر ما يصلك ومن أين — يُحفظ اختيارك تلقائيًا فور التعديل. بريد التنبيهات الأمنية إلزامي لحماية حسابك ولا يمكن إلغاؤه.
      </p>

      <ul className="mt-4 space-y-2.5">
        <li className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-6" style={{ color: "var(--ink)" }}>
            <input
              type="checkbox"
              className="mt-1.5 accent-(--accent)"
              checked={prefs.pushNewArticles}
              disabled={saving}
              onChange={(e) => void toggle("pushNewArticles", e.target.checked)}
            />
            <span>إشعارات المتصفح للمقالات الجديدة.</span>
          </label>
        </li>
        <li className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <label className="flex items-start gap-2.5 text-xs leading-6">
            <input type="checkbox" className="mt-1.5" checked disabled aria-label="بريد التنبيهات الأمنية إلزامي" />
            <span style={{ color: "var(--ink-muted)" }}>
              إشعارات البريد الإلكتروني للتنبيهات الأمنية (إلزامية مسبقًا ولا يمكن إلغاؤها).
            </span>
          </label>
        </li>
        <li className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-6" style={{ color: "var(--ink)" }}>
            <input
              type="checkbox"
              className="mt-1.5 accent-(--accent)"
              checked={prefs.impactAndReplies}
              disabled={saving}
              onChange={(e) => void toggle("impactAndReplies", e.target.checked)}
            />
            <span>إشعارات الأثر والردود على التعليقات.</span>
          </label>
        </li>
      </ul>

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
