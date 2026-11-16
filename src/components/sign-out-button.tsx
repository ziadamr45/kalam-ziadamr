"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

/** زر الخروج — جزيرة عميلة داخل صفحة الحساب الخادمية مع تأكيد خفيف */
export function SignOutButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      window.localStorage.removeItem("kalam_was_logged_in");
      window.localStorage.removeItem("kalam_avatar_cache");
    } catch {}
    await signOut({ redirectTo: "/" });
  };

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSignOut()}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold text-white transition-opacity disabled:opacity-60"
          style={{ background: "#b4443c" }}
        >
          {busy ? "جارٍ الخروج…" : "تأكيد الخروج"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-(--accent-soft)"
          style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
        >
          إلغاء
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-full border px-4 py-2 text-xs font-bold transition-all hover:scale-105"
      style={{ borderColor: "var(--border)", color: "#b4443c" }}
    >
      تسجيل الخروج
    </button>
  );
}
