"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* ============================ الثيم ============================ */

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: "light", toggleTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored =
      (typeof window !== "undefined" && window.localStorage.getItem("kalam_theme")) as Theme | null;
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const applyTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem("kalam_theme", next);
        document.cookie = `kalam_theme=${next}; path=/; max-age=31536000; samesite=lax`;
      } catch {}
      return next;
    });
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/* ===================== تسجيل Service Worker ===================== */

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ServiceWorkerRegistrar />
      </ThemeProvider>
    </SessionProvider>
  );
}
