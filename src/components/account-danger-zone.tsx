"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

/*
 * منطقة حذف الحساب — الوعد الحرفي في سياسة الخصوصية:
 * حذف فوري كامل بيد القارئ نفسه، بتأكيد مزدوج لمنع اللمس الخاطئ.
 */

export function AccountDangerZone() {
  const [stage, setStage] = useState<"idle" | "confirm" | "typing">("idle");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const doDelete = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (res.ok) {
        await signOut({ redirectTo: "/" });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "تعذر إتمام الحذف — جرّب مرة أخرى");
      setBusy(false);
    } catch {
      setError("تعذر الاتصال بالخادم");
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-6"
      style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
    >
      <h3 className="font-ui text-sm font-bold" style={{ color: "#991B1B" }}>
        حذف الحساب وبياناته بالكامل
      </h3>
      <p className="mt-2 text-xs leading-7" style={{ color: "#7F1D1D" }}>
        كما وعدتِ في سياسة الخصوصية: الحذف فوري وبيدك — يمسح حسابك وكل تعليقاتك وتصويتاتك
        ومكتبتك المتزامنة فورًا ودون رجعة. لقطات الجهاز داخل متصفحك تبقى لك، وامسحها من صفحة
        «قراءاتي المحفوظة» إن أردت. هذا الإجراء لا يمكن التراجع عنه مطلقًا.
      </p>

      {stage === "idle" && (
        <button
          onClick={() => setStage("confirm")}
          className="mt-4 rounded-xl px-5 py-2.5 text-xs font-bold transition-all hover:opacity-90"
          style={{ background: "#B4443C", color: "#fff" }}
        >
          أريد حذف حسابي نهائيًا
        </button>
      )}

      {stage === "confirm" && (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "#FECACA", background: "#fff" }}>
          <p className="text-xs font-bold leading-6" style={{ color: "#991B1B" }}>
            تأكيد أخير: هل أنت متأكد تمامًا؟ لا يمكن استرجاع الحساب أو أي بيانات بعده.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setStage("typing")}
              className="rounded-lg px-4 py-2 text-[11px] font-bold"
              style={{ background: "#B4443C", color: "#fff" }}
            >
              نعم، تابع الحذف
            </button>
            <button
              onClick={() => setStage("idle")}
              className="rounded-lg border px-4 py-2 text-[11px] font-bold"
              style={{ borderColor: "#FECACA", color: "#991B1B" }}
            >
              تراجع — أبقي حسابي
            </button>
          </div>
        </div>
      )}

      {stage === "typing" && (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "#FECACA", background: "#fff" }}>
          <label htmlFor="delete-word" className="block text-xs font-bold" style={{ color: "#991B1B" }}>
            اكتب كلمة <span dir="ltr">حذف</span> لتُفعَّل زر الحذف النهائي
          </label>
          <input
            id="delete-word"
            value={word}
            onChange={(e) => setWord(e.target.value.trim())}
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "#FECACA" }}
            placeholder="حذف"
            autoComplete="off"
          />
          {error && (
            <p className="mt-2 text-[11px] font-bold" style={{ color: "#991B1B" }}>
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={doDelete}
              disabled={busy || word !== "حذف"}
              className="rounded-lg px-4 py-2 text-[11px] font-bold transition-opacity disabled:opacity-40"
              style={{ background: "#B4443C", color: "#fff" }}
            >
              {busy ? "جارٍ حذف كل شيء.." : "حذف نهائي — لن أعد"}
            </button>
            <Link
              href="/privacy"
              className="text-[11px] underline"
              style={{ color: "#7F1D1D" }}
            >
              راجع سياسة الخصوصية
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
