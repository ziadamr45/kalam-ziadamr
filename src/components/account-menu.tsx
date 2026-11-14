"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";

const AVATAR_CACHE_KEY = "kalam_avatar_cache";
type CachedAvatar = { name?: string | null; image?: string | null; email?: string | null };

function LoginIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export function AccountMenu() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cached, setCached] = useState<CachedAvatar | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AVATAR_CACHE_KEY);
      if (raw) setCached(JSON.parse(raw) as CachedAvatar);
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const next: CachedAvatar = {
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        email: session.user.email ?? null,
      };
      setCached(next);
      try {
        window.localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(next));
      } catch {}
    } else if (status === "unauthenticated") {
      setCached(null);
      try {
        window.localStorage.removeItem(AVATAR_CACHE_KEY);
      } catch {}
    }
  }, [status, session?.user]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (status === "loading" && !cached) {
    return <span className="inline-block h-7 w-7 animate-pulse rounded-full" style={{ background: "var(--border)" }} aria-hidden />;
  }

  if (status === "unauthenticated" || (!session?.user && !cached)) {
    return (
      <Link
        href={`/auth/login?callback=${encodeURIComponent(pathname || "/")}`}
        title="تسجيل الدخول بحساب Google"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all hover:scale-105"
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        <LoginIcon />
        <span className="hidden sm:inline">دخول</span>
      </Link>
    );
  }

  const u = session?.user ?? cached!;

  return (
    <div className="relative" ref={menuRef}>
      {/* زر اللمس يحافظ على 44px للموبايل بينما الدائرة المرئية ثابتة 28×28px
          لتتناسق مع أيقونات البحث والوضع الليلي والقائمة */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title={u.name || "حسابي"}
        data-tour="account-avatar"
        className="flex h-8 w-8 items-center justify-center self-center rounded-full transition-all duration-300 hover:scale-110"
      >
        <span
          className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border"
          style={{
            borderColor: open ? "var(--accent)" : "rgba(245, 158, 11, 0.35)",
          }}
        >
          {u.image ? (
            <Image
              src={u.image}
              alt={u.name || "صورة الحساب"}
              width={28}
              height={28}
              referrerPolicy="no-referrer"
              className="block h-full w-full object-cover"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-xs font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {(u.name || "ق").trim().charAt(0)}
            </span>
          )}
        </span>
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
              href="/profile"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-(--accent-soft)"
              style={{ color: "var(--ink)" }}
            >
              ملفي الشخصي
            </Link>
            <Link
              href="/saved"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-(--accent-soft)"
              style={{ color: "var(--ink)" }}
            >
              قراءاتي المحفوظة
            </Link>
            <Link
              href="/profile?tab=settings"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-(--accent-soft)"
              style={{ color: "var(--ink)" }}
            >
              الإعدادات والتفضيلات
            </Link>
            <Link
              href="/profile?tab=security"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 transition-colors hover:bg-(--accent-soft)"
              style={{ color: "var(--ink)" }}
            >
              الأمان والجلسات
            </Link>
            <div className="my-1 h-px" style={{ background: "var(--border)" }} aria-hidden />
            <button
              onClick={async () => {
                try {
                  window.localStorage.removeItem("kalam_was_logged_in");
                  window.localStorage.removeItem(AVATAR_CACHE_KEY);
                } catch {}
                await signOut({ redirectTo: "/" });
              }}
              className="block w-full rounded-xl px-3 py-2 text-right transition-colors hover:bg-(--accent-soft)"
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
