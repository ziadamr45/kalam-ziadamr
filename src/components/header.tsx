"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/providers";
import { AccountMenu } from "@/components/account-menu";
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
  /* درج التنقل المتنقل — انسيابي بلا لاج مع قفل التمرير */
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  /* وضع الغمر + إغلاق الدرج بمفتاح Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImmersed(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("immersion", immersed);
    return () => document.body.classList.remove("immersion");
  }, [immersed]);

  /* قفل تمرير الصفحة أثناء فتح الدرج + شريط تمرير مضبوط */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  if (immersed) {
    return (
      <button
        onClick={() => setImmersed(false)}
        className="fixed bottom-5 left-5 z-50 rounded-full px-4 py-2.5 text-sm shadow-lift transition-all hover:scale-105"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        إنهاء وضع الغمر (Esc)
      </button>
    );
  }

  return (
    <>
      <header
        className={`site-header fixed inset-x-0 top-0 z-40 transition-all duration-500 ease-fluid ${
          hidden && !drawerOpen ? "-translate-y-full" : "translate-y-0"
        } ${solid ? "shadow-soft backdrop-blur-md" : ""}`}
        style={{
          background: solid || drawerOpen ? "color-mix(in srgb, var(--bg) 88%, transparent)" : "transparent",
          borderBottom: solid || drawerOpen ? "1px solid var(--border)" : "1px solid transparent",
        }}
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex flex-col leading-tight" onClick={() => setDrawerOpen(false)}>
            <span className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
              كلام له لازمة
            </span>
            <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
              مش كل كلام لازم يتقال..
            </span>
          </Link>

          {/* تنقل سطح المكتب — يختفي تمامًا على الهواتف */}
          <nav className="hidden items-center gap-1 text-sm md:flex">
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

            <AccountMenu />
          </nav>

          {/* أدوات الهاتف: ثيم + حساب + قائمة */}
          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={toggleTheme}
              aria-label="تبديل الثيم"
              className="rounded-full p-2.5 transition-colors active:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
            >
              <ThemeIcon dark={theme === "dark"} />
            </button>
            <div className="account-menu-mobile">
              <AccountMenu />
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح قائمة التنقل"
              aria-expanded={drawerOpen}
              className="rounded-full p-2.5 transition-colors active:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* درج التنقل المتنقل — من اليمين بحركة ناعمة */}
      <div
        className={`fixed inset-0 z-[55] md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        {/* الطبقة المعتمة */}
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* الدرجة الجانبية */}
        <aside
          className={`absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col shadow-lift transition-transform duration-300 ease-fluid ${
            drawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ background: "var(--surface)", borderTopRightRadius: 0 }}
          role="dialog"
          aria-label="قائمة التنقل"
        >
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="font-ui font-bold" style={{ color: "var(--ink)" }}>
                كلام له لازمة
              </p>
              <p className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
                مش كل كلام لازم يتقال..
              </p>
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="إغلاق القائمة"
              className="rounded-full p-2.5 transition-colors active:bg-[var(--accent-soft)]"
              style={{ color: "var(--ink-muted)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* روابط التنقل — أهداف لمس مريحة للإبهام */}
          <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors active:bg-[var(--accent-soft)]"
              style={{ color: pathname === "/" ? "var(--accent-strong)" : "var(--ink)" }}
            >
              الرئيسية
              <span aria-hidden style={{ color: "var(--border)" }}>←</span>
            </Link>

            <p className="mb-2 mt-5 px-4 text-xs font-bold" style={{ color: "var(--ink-muted)" }}>
              الأقسام
            </p>
            <div className="space-y-1">
              {SECTIONS.map((s) => (
                <Link
                  key={s.slug}
                  href={`/section/${s.slug}`}
                  onClick={() => setDrawerOpen(false)}
                  className="block rounded-2xl px-4 py-3 transition-colors active:bg-[var(--accent-soft)]"
                >
                  <span className="block font-semibold" style={{ color: "var(--ink)" }}>
                    {s.name}
                  </span>
                  <span className="mt-0.5 block text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                    {s.description}
                  </span>
                </Link>
              ))}
            </div>

            <p className="mb-2 mt-5 px-4 text-xs font-bold" style={{ color: "var(--ink-muted)" }}>
              المنصة
            </p>
            <div className="space-y-1">
              {[
                { href: "/about", label: "عن المنصة" },
                { href: "/saved", label: "قراءاتي المحفوظة" },
                { href: "/me", label: "حسابي" },
                { href: "/contact", label: "اتصل بنا" },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-4 py-3.5 font-semibold transition-colors active:bg-[var(--accent-soft)]"
                  style={{ color: pathname === l.href ? "var(--accent-strong)" : "var(--ink)" }}
                >
                  {l.label}
                  <span aria-hidden style={{ color: "var(--border)" }}>←</span>
                </Link>
              ))}
            </div>
          </nav>

          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => {
                setImmersed(true);
                setDrawerOpen(false);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              وضع القراءة المركزة
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
