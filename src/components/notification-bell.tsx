"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushSupported, subscribeToPush, resyncExistingSubscription } from "@/lib/push-client";

/**
 * منظومة إشعارات المستخدمين التفاعلية (المحور الرابع):
 * - سطح المكتب والتابلت: أيقونة جرس ببادج أحمر في الهيدر بجانب صورة الحساب.
 * - الهواتف: بند رئيسي بارز داخل القائمة الجانبية (درج الموبايل) حصريًا —
 *   لا شيء يُضاف للهيدر العلوي تفاديًا للتزاحم وكسر التصميم.
 * - القائمة تعرض الإشعارات الداخلية (تحديثات المنصة، البث الجماهيري،
 *   الإشعارات المخصصة) مع خيار تفعيل إشعارات المتصفح الفورية.
 */

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  kind: string;
  readAt: string | null;
  createdAt: string;
};

type PushState = "unknown" | "unsupported" | "denied" | "off" | "on";

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
}

function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pushState, setPushState] = useState<PushState>("unknown");
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        setItems([]);
        setUnread(0);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[]; unread: number };
      setAuthed(true);
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* الشبكة متقطعة — يُعاد المحاولة في الدورة التالية */
    }
  }, []);

  const refreshPushState = useCallback(async () => {
    if (!pushSupported()) {
      setPushState("unsupported");
      return;
    }
    try {
      if (Notification.permission === "denied") {
        setPushState("denied");
        return;
      }
      if (Notification.permission !== "granted") {
        setPushState("off");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setPushState(sub ? "on" : "off");
    } catch {
      setPushState("off");
    }
  }, []);

  useEffect(() => {
    load();
    refreshPushState();
    resyncExistingSubscription();
    const timer = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, refreshPushState]);

  const enablePush = useCallback(async () => {
    setEnabling(true);
    try {
      const result = await subscribeToPush();
      if (result.ok) setPushState("on");
      else if (result.reason === "denied") setPushState("denied");
      else if (result.reason === "unsupported") setPushState("unsupported");
    } finally {
      setEnabling(false);
    }
  }, []);

  const markAll = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }, []);

  const markOne = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  return { items, unread, authed, pushState, enabling, load, enablePush, markAll, markOne };
}

function BellGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-0.5 -left-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
      style={{ background: "#DC2626" }}
      aria-label={`${count} إشعار غير مقروء`}
    >
      {count > 99 ? "+99" : count}
    </span>
  );
}

function PushEnableRow({
  authed,
  pushState,
  enabling,
  onEnable,
}: {
  authed: boolean | null;
  pushState: PushState;
  enabling: boolean;
  onEnable: () => void;
}) {
  if (authed === false) {
    return (
      <Link
        href="/login"
        className="block rounded-xl px-3 py-2.5 text-center text-xs font-bold transition-colors hover:bg-[var(--accent-soft)]"
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        سجّل الدخول بجوجل لتفعيل الإشعارات الفورية
      </Link>
    );
  }
  if (pushState === "unsupported") {
    return (
      <p className="px-3 py-2 text-center text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
        إشعارات المتصفح غير مدعومة في هذا الجهاز — ستبقى الإشعارات الداخلية متاحة.
      </p>
    );
  }
  if (pushState === "denied") {
    return (
      <p className="px-3 py-2 text-center text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
        الإشعارات محجوبة من إعدادات المتصفح — فعّلها من إعدادات الموقع لتصلك الفورية.
      </p>
    );
  }
  if (pushState === "on") {
    return (
      <p className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold" style={{ color: "var(--accent-strong)" }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
        إشعارات المتصفح الفورية مفعّلة
      </p>
    );
  }
  return (
    <button
      onClick={onEnable}
      disabled={enabling}
      className="w-full rounded-xl px-3 py-2.5 text-xs font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
      style={{ background: "var(--accent)", color: "#fff" }}
    >
      {enabling ? "جارٍ التفعيل.." : "تفعيل إشعارات المتصفح الفورية"}
    </button>
  );
}

function NotificationList({
  items,
  onMarkOne,
  onNavigate,
}: {
  items: NotificationItem[];
  onMarkOne: (id: string) => void;
  onNavigate?: () => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        لا إشعارات بعد.. جديد المنصة وتحديثاتها سيصلك هنا فورًا.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((n) => (
        <li key={n.id}>
          {n.url ? (
            <Link
              href={n.url}
              onClick={() => {
                if (!n.readAt) onMarkOne(n.id);
                onNavigate?.();
              }}
              className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--accent-soft)]"
            >
              <span className="flex items-center gap-1.5">
                {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                <span className="text-xs font-bold leading-6" style={{ color: "var(--ink)" }}>
                  {n.title}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                {n.body.length > 110 ? `${n.body.slice(0, 110)}…` : n.body}
              </span>
              <span className="mt-1 block text-[10px]" style={{ color: "var(--ink-muted)" }}>
                {timeAgo(n.createdAt)}
              </span>
            </Link>
          ) : (
            <button
              onClick={() => {
                if (!n.readAt) onMarkOne(n.id);
                onNavigate?.();
              }}
              className="block w-full rounded-xl px-3 py-2.5 text-right transition-colors hover:bg-[var(--accent-soft)]"
            >
              <span className="flex items-center gap-1.5">
                {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                <span className="text-xs font-bold leading-6" style={{ color: "var(--ink)" }}>
                  {n.title}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                {n.body.length > 110 ? `${n.body.slice(0, 110)}…` : n.body}
              </span>
              <span className="mt-1 block text-[10px]" style={{ color: "var(--ink-muted)" }}>
                {timeAgo(n.createdAt)}
              </span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** جرس الإشعارات في الهيدر — للحاسوب والتابلت فقط (يُخفى على الهواتف عبر CSS) */
export function NotificationBell() {
  const { items, unread, authed, pushState, enabling, enablePush, markAll, markOne } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-expanded={open}
        title="الإشعارات"
        className="relative rounded-full p-2 transition-all hover:scale-110 hover:bg-[var(--accent-soft)]"
        style={{ color: "var(--ink)" }}
      >
        <BellGlyph />
        <UnreadBadge count={unread} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border p-2 shadow-lift animate-fade-in"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-ui text-sm font-bold" style={{ color: "var(--ink)" }}>
              الإشعارات
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[11px] font-bold transition-colors hover:opacity-70"
                style={{ color: "var(--accent-strong)" }}
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain">
            <NotificationList items={items} onMarkOne={markOne} onNavigate={() => setOpen(false)} />
          </div>
          <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <PushEnableRow authed={authed} pushState={pushState} enabling={enabling} onEnable={enablePush} />
          </div>
        </div>
      )}
    </div>
  );
}

/** بند الإشعارات البارز داخل درج الموبايل — الحصرية الهاتفية للجرس */
export function DrawerNotifications() {
  const { items, unread, authed, pushState, enabling, enablePush, markAll, markOne } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors active:bg-[var(--accent-soft)]"
        style={{ color: "var(--ink)" }}
      >
        <span className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
            <BellGlyph size={18} />
            {unread > 0 && (
              <span
                className="absolute -top-1 -left-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
                style={{ background: "#DC2626" }}
              >
                {unread > 99 ? "+99" : unread}
              </span>
            )}
          </span>
          الإشعارات
        </span>
        <span aria-hidden style={{ color: "var(--border)" }}>{open ? "▾" : "←"}</span>
      </button>

      {open && (
        <div
          className="mx-1 mb-2 rounded-2xl border p-2"
          style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
              آخر التحديثات والتنبيهات
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[11px] font-bold"
                style={{ color: "var(--accent-strong)" }}
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            <NotificationList items={items} onMarkOne={markOne} />
          </div>
          <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <PushEnableRow authed={authed} pushState={pushState} enabling={enabling} onEnable={enablePush} />
          </div>
        </div>
      )}
    </div>
  );
}
