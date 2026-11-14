"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { NotificationBell, DrawerNotifications } from "@/components/notification-bell";
import { BrandMark } from "@/components/brand-mark";
import SearchPalette from "@/components/search-palette";

/* الأقسام الحية الواردة من الخادم (مجلوبة من Neon عبر مكوّن SiteHeader) */
export type NavSection = {
  slug: string;
  name: string;
  description: string;
  count?: number;
};

/* زر الهمبرجر المتحوّل — ثلاثة شرائط تتحول إلى ✕ بتحويلات CSS نقية */
function MorphBurger({ open }: { open: boolean }) {
  const bar =
    "absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full transition-all duration-300 ease-fluid";
  return (
    <span className="relative block h-[18px] w-[18px]" aria-hidden>
      <span
        className={bar}
        style={{
          background: "currentColor",
          transform: open ? "rotate(45deg)" : "translateY(-5px)",
        }}
      />
      <span
        className={bar}
        style={{
          background: "currentColor",
          opacity: open ? 0 : 1,
          transform: open ? "scaleX(0.2)" : "scaleX(1)",
        }}
      />
      <span
        className={bar}
        style={{
          background: "currentColor",
          transform: open ? "rotate(-45deg)" : "translateY(5px)",
        }}
      />
    </span>
  );
}

export function Header({ navSections = [] }: { navSections?: NavSection[] }) {
  const pathname = usePathname();
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [immersed, setImmersed] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionsRef = useRef<HTMLDivElement | null>(null);
  /* درج التنقل المتنقل — انسيابي بلا لاج مع قفل التمرير */
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* الأقسام الحية من قاعدة البيانات — لا مصفوفات ثابتة هنا بعد اليوم */
  const sections = navSections;
  /* إشعار «وضع القراءة المركزة» — كبسولة هادئة لثانيتين */
  const [readerToast, setReaderToast] = useState(false);
  const readerToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* مؤقت انهيار العناصر المخفاة — يُطلق بعد اكتمال تلاشيها البصري */
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastY = useRef(0);

  const isArticlePage = pathname?.startsWith("/article/") ?? false;
  const isHomeActive = pathname === "/";
  const isSectionActive = (pathname?.startsWith("/section/") ?? false) || sectionsOpen;
  const isAboutActive = pathname === "/about";

  /* إغلاق قائمة الأقسام المنسدلة عند الضغط خارجها */
  useEffect(() => {
    if (!sectionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (sectionsRef.current && !sectionsRef.current.contains(e.target as Node)) {
        setSectionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [sectionsOpen]);

  const enterImmersion = useCallback(() => {
    setDrawerOpen(false);
    setImmersed(true);
    if (readerToastTimer.current) clearTimeout(readerToastTimer.current);
    setReaderToast(true);
    readerToastTimer.current = setTimeout(() => setReaderToast(false), 2000);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => {
      const body = document.getElementById("article-body");
      const before = body?.getBoundingClientRect().top ?? null;
      document.body.classList.add("immersion-collapsed");
      void document.body.offsetHeight;
      const after = body?.getBoundingClientRect().top ?? null;
      if (before != null && after != null && after !== before) {
        window.scrollBy({ top: after - before, behavior: "instant" as ScrollBehavior });
      }
      try {
        window.localStorage.setItem("kalam_immersion", "on");
        document.documentElement.setAttribute("data-immersion", "on");
        window.sessionStorage.setItem(
          `kalam_immersion_anchor:${window.location.pathname}`,
          String(Math.round(window.scrollY)),
        );
      } catch {}
    }, 540);
  }, []);

  const exitImmersion = useCallback(() => {
    setImmersed(false);
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    try {
      window.localStorage.removeItem("kalam_immersion");
    } catch {}
    try {
      window.sessionStorage.removeItem(`kalam_immersion_anchor:${window.location.pathname}`);
    } catch {}
    document.documentElement.removeAttribute("data-immersion");
    const body = document.getElementById("article-body");
    const before = body?.getBoundingClientRect().top ?? null;
    document.body.classList.remove("immersion-collapsed");
    void document.body.offsetHeight;
    const after = body?.getBoundingClientRect().top ?? null;
    if (before != null && after != null && after !== before) {
      window.scrollBy({ top: after - before, behavior: "instant" as ScrollBehavior });
    }
    document.body.classList.remove("immersion");
  }, []);

  useEffect(
    () => () => {
      if (readerToastTimer.current) clearTimeout(readerToastTimer.current);
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    },
    [],
  );

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
        exitImmersion();
        setDrawerOpen(false);
        setSectionsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitImmersion]);

  useEffect(() => {
    document.body.classList.toggle("immersion", immersed);
    if (!immersed) document.body.classList.remove("immersion-collapsed");
    return () => document.body.classList.remove("immersion");
  }, [immersed]);

  /* قفل تمرير الصفحة أثناء فتح الدرج + شريط تمرير مضبوط */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  /* صمام أمان: لو انتقل القارئ من مقال لمسار آخر وهو في الغمر يُطفأ فورًا */
  useEffect(() => {
    if (immersed && !isArticlePage) exitImmersion();
  }, [immersed, isArticlePage, exitImmersion]);

  useEffect(() => {
    if (!isArticlePage) return;
    let on = false;
    try {
      on = window.localStorage.getItem("kalam_immersion") === "on";
    } catch {}
    if (!on) return;
    setImmersed(true);
    document.body.classList.add("immersion", "immersion-collapsed");
    document.documentElement.setAttribute("data-immersion", "on");

    const anchorKey = `kalam_immersion_anchor:${window.location.pathname}`;
    let anchor: number | null = null;
    try {
      const raw = window.sessionStorage.getItem(anchorKey);
      if (raw) anchor = Number.parseInt(raw, 10) || null;
    } catch {}

    let lastSave = 0;
    const onSaveScroll = () => {
      if (!document.body.classList.contains("immersion")) return;
      const now = Date.now();
      if (now - lastSave < 600) return;
      lastSave = now;
      try {
        window.sessionStorage.setItem(anchorKey, String(Math.round(window.scrollY)));
      } catch {}
    };
    window.addEventListener("scroll", onSaveScroll, { passive: true });

    let alive = true;
    void (async () => {
      try {
        await document.fonts.ready;
      } catch {}
      if (!alive) return;
      requestAnimationFrame(() => {
        if (!alive || anchor == null) return;
        if (Math.abs(window.scrollY - anchor) > 2) {
          window.scrollTo({ top: anchor, behavior: "instant" as ScrollBehavior });
        }
      });
    })();

    return () => {
      alive = false;
      window.removeEventListener("scroll", onSaveScroll);
    };
  }, [isArticlePage, pathname]);

  if (immersed) {
    return (
      <>
        {readerToast && (
          <div className="fixed left-1/2 top-5 z-60 -translate-x-1/2 animate-fade-in">
            <p
              className="whitespace-nowrap rounded-full border px-5 py-2.5 text-xs font-semibold shadow-lift sm:text-sm"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--ink)",
              }}
              role="status"
            >
              تم تفعيل وضع القراءة المركزة.. قراءة هادئة ومثمرة
            </p>
          </div>
        )}

        <button
          onClick={exitImmersion}
          className="fixed left-5 top-5 z-50 min-h-[48px] rounded-full border px-5 py-2.5 text-xs font-bold shadow-lift transition-all hover:scale-105 active:scale-95 sm:text-sm"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink)",
          }}
        >
          خروج من وضع القراءة
        </button>
      </>
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
            <span className="flex items-center gap-1.5">
              <BrandMark size={17} />
              <span className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
                كلام له لازمة
              </span>
            </span>
            <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
              مش كل كلام لازم يتقال..
            </span>
          </Link>

          {/* تنقل سطح المكتب — مع تمييز واضح للصفحة النشطة ودعم الضغط والمرور لقائمة الأقسام */}
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <Link
              href="/"
              aria-current={isHomeActive ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 transition-colors hover:bg-(--accent-soft) ${
                isHomeActive ? "font-bold" : ""
              }`}
              style={{
                background: isHomeActive ? "var(--accent-soft)" : "transparent",
                color: isHomeActive ? "var(--accent-strong)" : "var(--ink)",
              }}
            >
              الرئيسية
            </Link>

            <div
              ref={sectionsRef}
              className="relative"
              onMouseEnter={() => setSectionsOpen(true)}
              onMouseLeave={() => setSectionsOpen(false)}
            >
              <button
                type="button"
                onClick={() => setSectionsOpen((v) => !v)}
                className={`flex cursor-pointer items-center gap-1 rounded-full px-3.5 py-1.5 transition-colors hover:bg-(--accent-soft) ${
                  isSectionActive ? "font-bold" : ""
                }`}
                style={{
                  background: isSectionActive ? "var(--accent-soft)" : "transparent",
                  color: isSectionActive ? "var(--accent-strong)" : "var(--ink)",
                }}
                aria-haspopup="true"
                aria-expanded={sectionsOpen}
              >
                الأقسام
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${sectionsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {sectionsOpen && (
                <div
                  className="absolute right-0 top-full pt-1.5 w-72 z-50"
                >
                  <div
                    className="rounded-2xl border p-2 shadow-lift animate-fade-in"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    {sections.map((s) => {
                      const activeSec = pathname === `/section/${s.slug}` || pathname === `/section/${encodeURIComponent(s.slug)}`;
                      return (
                        <Link
                          key={s.slug}
                          href={`/section/${encodeURIComponent(s.slug)}`}
                          className="block rounded-xl px-3 py-2 transition-colors hover:bg-(--accent-soft)"
                          style={{
                            background: activeSec ? "var(--accent-soft)" : undefined,
                          }}
                          onClick={() => setSectionsOpen(false)}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className="font-semibold"
                              style={{ color: activeSec ? "var(--accent-strong)" : "var(--ink)" }}
                            >
                              {s.name}
                            </span>
                            {typeof s.count === "number" && s.count > 0 && (
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                              >
                                {s.count}
                              </span>
                            )}
                          </span>
                          {s.description && (
                            <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-muted)" }}>
                              {s.description}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/about"
              aria-current={isAboutActive ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 transition-colors hover:bg-(--accent-soft) ${
                isAboutActive ? "font-bold" : ""
              }`}
              style={{
                background: isAboutActive ? "var(--accent-soft)" : "transparent",
                color: isAboutActive ? "var(--accent-strong)" : "var(--ink)",
              }}
            >
              عن المنصة
            </Link>

            <SearchPalette hostDialog />

            {isArticlePage && (
              <button
                onClick={enterImmersion}
                title="وضع الغمر الكامل"
                aria-label="وضع الغمر الكامل"
                className="rounded-full p-2 transition-all hover:scale-110 hover:bg-(--accent-soft)"
                style={{ color: "var(--accent)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}

            <ThemeToggle className="p-2" />

            <NotificationBell />

            <AccountMenu />
          </nav>

          {/* أدوات الهاتف: بحث + ثيم + حساب + قائمة */}
          <div className="flex items-center gap-1 md:hidden">
            <SearchPalette />
            <ThemeToggle className="p-2.5" />
            <div className="account-menu-mobile">
              <AccountMenu />
            </div>
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح قائمة التنقل"
              aria-expanded={drawerOpen}
              className="rounded-full p-2.5 transition-colors active:bg-(--accent-soft)"
              style={{ color: "var(--ink)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* درج التنقل المتنقل */}
      <div
        className={`fixed inset-0 z-55 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <button
          onClick={() => setDrawerOpen(false)}
          aria-label={drawerOpen ? "إغلاق القائمة" : "فتح قائمة التنقل"}
          aria-expanded={drawerOpen}
          tabIndex={drawerOpen ? 0 : -1}
          className={`fixed left-3 top-[10px] z-60 flex h-11 w-11 items-center justify-center rounded-full border shadow-soft transition-all duration-300 ease-fluid md:hidden ${
            drawerOpen
              ? "pointer-events-auto scale-100 opacity-100"
              : "pointer-events-none scale-75 opacity-0"
          }`}
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink)",
          }}
        >
          <MorphBurger open={drawerOpen} />
        </button>

        <aside
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col shadow-lift transition-transform duration-300 ease-fluid ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "var(--surface)", borderTopLeftRadius: 0 }}
          role="dialog"
          aria-label="قائمة التنقل"
        >
          <div className="flex items-center justify-start border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="flex items-center gap-1.5 font-ui font-bold" style={{ color: "var(--ink)" }}>
                <BrandMark size={16} />
                كلام له لازمة
              </p>
              <p className="text-[10px]" style={{ color: "var(--ink-muted)" }}>
                مش كل كلام لازم يتقال..
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            <Link
              href="/"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors active:bg-(--accent-soft)"
              style={{
                background: isHomeActive ? "var(--accent-soft)" : undefined,
                color: isHomeActive ? "var(--accent-strong)" : "var(--ink)",
              }}
            >
              الرئيسية
              <span aria-hidden style={{ color: isHomeActive ? "var(--accent-strong)" : "var(--border)" }}>←</span>
            </Link>

            <DrawerNotifications />

            <p className="mb-2 mt-5 px-4 text-xs font-bold" style={{ color: "var(--ink-muted)" }}>
              الأقسام
            </p>
            <div className="space-y-1">
              {sections.map((s) => {
                const activeSec = pathname === `/section/${s.slug}` || pathname === `/section/${encodeURIComponent(s.slug)}`;
                return (
                  <Link
                    key={s.slug}
                    href={`/section/${encodeURIComponent(s.slug)}`}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors active:bg-(--accent-soft)"
                    style={{
                      background: activeSec ? "var(--accent-soft)" : undefined,
                    }}
                  >
                    <span className="min-w-0">
                      <span
                        className="block font-semibold"
                        style={{ color: activeSec ? "var(--accent-strong)" : "var(--ink)" }}
                      >
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="mt-0.5 block text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                          {s.description}
                        </span>
                      )}
                    </span>
                    {typeof s.count === "number" && s.count > 0 && (
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                      >
                        {s.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            <p className="mb-2 mt-5 px-4 text-xs font-bold" style={{ color: "var(--ink-muted)" }}>
              المنصة
            </p>
            <div className="space-y-1">
              {[
                { href: "/about", label: "عن المنصة" },
                { href: "/saved", label: "قراءاتي المحفوظة" },
                { href: "/profile", label: "ملفي ورصيد أثري" },
                { href: "/contact", label: "اتصل بنا" },
              ].map((l) => {
                const activeLink = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center justify-between rounded-2xl px-4 py-3.5 font-semibold transition-colors active:bg-(--accent-soft)"
                    style={{
                      background: activeLink ? "var(--accent-soft)" : undefined,
                      color: activeLink ? "var(--accent-strong)" : "var(--ink)",
                    }}
                  >
                    {l.label}
                    <span aria-hidden style={{ color: activeLink ? "var(--accent-strong)" : "var(--border)" }}>←</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {isArticlePage && (
            <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <button
                onClick={enterImmersion}
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
          )}
        </aside>
      </div>
    </>
  );
}
