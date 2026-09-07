"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

/* أيقونة الدخول */
function LoginIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

/**
 * منطقة الحساب في الهيدر:
 * - زائر → زر «دخول» (يعود للصفحة نفسها بعد الدخول)
 * - مسجّل → صورته + قائمة (حسابي، قراءاتي، خروج)
 */
export function AccountMenu() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* إغلاق القائمة عند النقر خارجها */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (status === "loading") {
    return <span className="inline-block h-8 w-8 animate-pulse rounded-full" style={{ background: "var(--border)" }} aria-hidden />;
  }

  /* زائر: زر دخول يعود لنفس الصفحة */
  if (status === "unauthenticated" || !session?.user) {
    return (
      <Link
        href={`/login?callback=${encodeURIComponent(pathname || "/")}`}
        title="تسجيل الدخول بحساب Google"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all hover:scale-105"
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        <LoginIcon />
        <span className="hidden sm:inline">دخول</span>
      </Link>
    );
  }

  const u = session.user;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title={u.name || "حسابي"}
        className="rounded-full transition-all duration-300 hover:scale-110"
      >
        {u.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={u.image}
            alt={u.name || "صورة الحساب"}
            width={32}
            height={32}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full border-2 object-cover"
            style={{ borderColor: open ? "var(--accent)" : "var(--border)" }}
          />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold"
            style={{ borderColor: "var(--border)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}
          >
            {(u.name || "ق").trim().charAt(0)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border shadow-lift animate-fade-in"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="truncate text-sm font-bold" style={{ color: "var(--ink)" }}>
              {u.name || "قارئ كلام له لازمة"}
            </p>
            <p className="mt-0.5 truncate text-[11px]" dir="ltr" style={{ color: "var(--ink-muted)" }}>
              {u.email}
            </p>
          </div>
          <nav className="p-2 text-sm">
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
            >
              حسابي وتعليقاتي
            </Link>
            <Link
              href="/saved"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
            >
              قراءاتي المحفوظة
            </Link>
            <button
              onClick={() => signOut({ redirectTo: "/" })}
              className="mt-1 block w-full rounded-xl px-3 py-2 text-right transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "#b4443c" }}
            >
              تسجيل الخروج
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
