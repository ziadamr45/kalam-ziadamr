"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDialogs } from "@/components/ui/dialogs";

/**
 * أدوات الخصوصية والتجربة — تبويب «الإعدادات والتفضيلات»:\n * - مسح سجل البحث الخاص بالحساب (وعد الخصوصية: سجلك بيدك وحدك).\n * - إعادة عرض بطاقة الترحيب فورًا دون إعادة تحميل الصفحة.\n */

export function PrivacyToolsCard() {
  const router = useRouter();
  const { confirm, toast } = useDialogs();
  const [busy, setBusy] = useState<null | "history" | "tour">(null);

  const clearSearchHistory = async () => {
    const ok = await confirm({
      title: "مسح سجل البحث",
      body: "سيُمسح سجل البحث الخاص بحسابك بالكامل — لا يمكن التراجع. هل تريد المتابعة؟",
      confirmLabel: "نعم، امسحه",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("history");
    try {
      const res = await fetch("/api/search/history", { method: "DELETE" });
      if (!res.ok) throw new Error("تعذر مسح السجل — جرّب مرة أخرى");
      toast("مُسح سجل البحث الخاص بحسابك بالكامل");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر الاتصال بالخادم", "error");
    } finally {
      setBusy(null);
    }
  };

  const replayTour = async () => {
    const ok = await confirm({
      title: "إعادة عرض الترحيب",
      body: "ستظهر بطاقة الترحيب من جديد مباشرةً في هذه الصفحة. هل تريد المتابعة؟",
      confirmLabel: "نعم، اعرضها",
    });
    if (!ok) return;
    setBusy("tour");
    try {
      const res = await fetch("/api/onboarding", { method: "DELETE" });
      if (!res.ok) throw new Error("تعذر تجهيز الترحيب — جرّب مرة أخرى");
      window.dispatchEvent(new Event("kalam:replay-onboarding"));
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذر الاتصال بالخادم", "error");
    } finally {
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
        سجلك وتجربتك بيدك وحدك — امسح ما تريد وأعِد عرض الترحيب متى أحببت.
      </p>

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
              بطاقة الترحيب
            </p>
            <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
              أعِد عرض بطاقة الترحيب التعريفية بالمنصة متى شئت.
            </p>
          </div>
          <button
            onClick={() => void replayTour()}
            disabled={busy !== null}
            className="rounded-xl border px-4 py-2 text-[11px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--accent-strong)" }}
          >
            {busy === "tour" ? "جارٍ التجهيز.." : "إعادة عرض الترحيب"}
          </button>
        </div>
      </div>
    </div>
  );
}
