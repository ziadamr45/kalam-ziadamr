"use client";

import { signOut } from "next-auth/react";

/** زر الخروج — جزيرة عميلة داخل صفحة الحساب الخادمية */
export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/" })}
      className="rounded-full border px-4 py-2 text-xs font-bold transition-all hover:scale-105"
      style={{ borderColor: "var(--border)", color: "#b4443c" }}
    >
      تسجيل الخروج
    </button>
  );
}
