"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/providers";
import { SECTIONS } from "@/lib/sections";

/* أيقونة قمر/شمس */
function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [immersed, setImmersed] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const lastY = useRef(0);

  /* إخفاء تلقائي سلس عند التمرير لأسفل وإعادته عند الصعود */
  const onScroll = useCallback(() => {
    const y = window.scrollY;
    setSolid(y > 24);
    if (Math.abs(y - lastY.current) < 8) return;
    setHidden(y > lastY.current && y > 140);
    lastY.current = y;
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  /* وضع الغمر */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("immersion", immersed);
    return () => document.body.classList.remove("immersion");
  }, [immersed]);

  if (immersed) {
    return (
      <button
        onClick={() => setImmersed(false)}
        className="fixed bottom-5 left-5 z-50 rounded-full px-4 py-2 text-sm shadow-lift transition-all hover:scale-105"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        إنهاء وضع الغمر (Esc)
      </button>
    );
  }

  return (
    <header
      className={`site-header fixed inset-x-0 top-0 z-40 transition-all duration-500 ease-fluid ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${solid ? "shadow-soft backdrop-blur-md" : ""}`}
      style={{
        background: solid ? "color-mix(in srgb, var(--bg) 88%, transparent)" : "transparent",
        borderBottom: solid ? "1px solid var(--border)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
            كلام له لازمة
          </span>
          <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
            مش كل كلام لازم يتقال..
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          <Link
            href="/"
            className="rounded-full px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: pathname === "/" ? "var(--accent-strong)" : "var(--ink)" }}
          >
            الرئيسية
          </Link>

          <div
            className="relative"
            onMouseEnter={() => setSectionsOpen(true)}
            onMouseLeave={() => setSectionsOpen(false)}
          >
            <button
              className="rounded-full px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
              aria-haspopup="true"
              aria-expanded={sectionsOpen}
            >
              الأقسام
            </button>
            {sectionsOpen && (
              <div
                className="absolute right-0 top-full w-72 rounded-2xl border p-2 shadow-lift animate-fade-in"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                {SECTIONS.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/section/${s.slug}`}
                    className="block rounded-xl px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
                    onClick={() => setSectionsOpen(false)}
                  >
                    <span className="block font-semibold" style={{ color: "var(--ink)" }}>
                      {s.name}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
                      {s.description}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/about"
            className="rounded-full px-3 py-2 transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: pathname === "/about" ? "var(--accent-strong)" : "var(--ink)" }}
          >
            عن المنصة
          </Link>

          <button
            onClick={() => setImmersed(true)}
            title="وضع الغمر الكامل"
            aria-label="وضع الغمر الكامل"
            className="rounded-full p-2 transition-all hover:scale-110 hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--accent)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "الوضع الفاتح" : "الوضع الليلي"}
            aria-label="تبديل الثيم"
            className="rounded-full p-2 transition-all hover:scale-110 hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink)" }}
          >
            <ThemeIcon dark={theme === "dark"} />
          </button>
        </nav>
      </div>
    </header>
  );
}
