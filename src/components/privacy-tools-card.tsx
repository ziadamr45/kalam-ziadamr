"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * أدوات الخصوصية والتجربة — تبويب «الإعدادات والتفضيلات»:
 * - مسح سجل البحث الخاص بالحساب (وعد الخصوصية: سجلك بيدك وحدك).
 * - إعادة عرض جولة الترحيب لمن يريد مشاهدتها من جديد.
 */

export function PrivacyToolsCard() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "history" | "tour">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const clearSearchHistory = async () => {
    if (!window.confirm("سيُمسح سجل البحث الخاص بحسابك بالكامل — لا يمكن التراجع. هل تريد المتابعة؟")) return;
    setBusy("history");
    setMessage(null);
    try {
      const res = await fetch("/api/search/history", { method: "DELETE" });
      if (!res.ok) throw new Error("تعذر مسح السجل — جرّب مرة أخرى");
      setMessage({ ok: true, text: "مُسح سجل البحث الخاص بحسابك بالكامل" });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر الاتصال بالخادم" });
    } finally {
      setBusy(null);
    }
  };

  const replayTour = async () => {
    if (!window.confirm("ستبدأ جولة الترحيب من جديد فورًا في هذه الصفحة. هل تريد المتابعة؟")) return;
    setBusy("tour");
    setMessage(null);
    try {
      const res = await fetch("/api/onboarding", { method: "DELETE" });
      if (!res.ok) throw new Error("تعذر تجهيز الجولة — جرّب مرة أخرى");
      /* إعادة تحميل كاملة كي يعيد فحص الأهلية من قاعدة البيانات ويبدأ فورًا */
      window.location.reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر الاتصال بالخادم" });
      setBusy(null);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 shadow-soft sm:p-6"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
        الخصوصية والتجربة
      </h2>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        سجلك وذكرياتك التجريبية بيدك وحدك — امسح ما تريد وعدِ ما تحب.
      </p>

      {message && (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-xs font-bold"
          style={{
            background: message.ok ? "rgba(60,122,78,0.12)" : "rgba(220,38,38,0.10)",
            color: message.ok ? "#3c7a4e" : "#DC2626",
          }}
          role="status"
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              سجل البحث الخاص بك
            </p>
            <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
              كل ما بحثت عنه محفوظ لأجلك — ومسحه بضغطة واحدة متى شئت.
            </p>
          </div>
          <button
            onClick={() => void clearSearchHistory()}
            disabled={busy !== null}
            className="rounded-xl border px-4 py-2 text-[11px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ borderColor: "rgba(220,38,38,0.35)", color: "#DC2626" }}
          >
            {busy === "history" ? "جارٍ المسح.." : "مسح سجل البحث"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              جولة الترحيب التفاعلية
            </p>
            <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
              اشتاقت إليها؟ أعِد عرضها كأول مرة — تشرح المنصة خطوة خطوة.
            </p>
          </div>
          <button
            onClick={() => void replayTour()}
            disabled={busy !== null}
            className="rounded-xl border px-4 py-2 text-[11px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}
          >
            {busy === "tour" ? "جارٍ التجهيز.." : "إعادة عرض الجولة"}
          </button>
        </div>
      </div>
    </div>
  );
}
