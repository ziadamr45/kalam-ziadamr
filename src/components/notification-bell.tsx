"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushSupported, subscribeToPush, resyncExistingSubscription } from "@/lib/push-client";

/**
 * مركز إشعارات القارئ التفاعلي — فوق الجدول المركزي الموحد (Notification):
 * - جرس تفاعلي بالهيدر بعداد رقمي حي (SSE لحظيًا + تحديث دوري احتياطي).
 * - نافذة منسدلة بتبويبين: «الكل» و«غير المقروءة» مع تعليم الكل كمقروء.
 * - مؤشرات أيقونية ملونة بحسب طبيعة الحدث (نجمة الأثر، فقاعة النقاش،
 *   درع الأمان، ماسة التوثيق، بوق النشر).
 * - توست لحظي (NotificationToasts) يظهر أسفل الشاشة عند وصول إشعار جديد
 *   أثناء التصفح — يُنقر فيفتح رابط الحدث.
 */

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
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

/* ===================== أيقونات ملونة بحسب طبيعة الحدث ===================== */

type IconMeta = { color: string; label: string };

export function typeIconMeta(type: string): IconMeta {
  if (type.startsWith("ADMIN_")) return { color: "#EA580C", label: "حدث سيادة" };
  if (type === "SECURITY_NEW_LOGIN") return { color: "#DC2626", label: "أمان" };
  if (type === "IMPACT_POINTS_EARNED") return { color: "#D97706", label: "أثر" };
  if (type.startsWith("COMMENT_")) return { color: "#0D9488", label: "نقاش" };
  if (type === "AHL_AL_KALIMA_UNLOCKED" || type === "USER_VERIFIED" || type.startsWith("VIP_"))
    return { color: "#1E3A8A", label: "توثيق وتمييز" };
  return { color: "var(--accent-strong)", label: "تحديث" };
}

function TypeIcon({ type, size = 30 }: { type: string; size?: number }) {
  const { color } = typeIconMeta(type);
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  let glyph: React.ReactNode;
  if (type === "SECURITY_NEW_LOGIN") {
    glyph = (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" {...stroke} />
        <path d="m9 12 2 2 4-4" {...stroke} />
      </>
    );
  } else if (type === "IMPACT_POINTS_EARNED") {
    glyph = (
      <>
        <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" {...stroke} />
      </>
    );
  } else if (type.startsWith("COMMENT_") || type === "BROADCAST") {
    glyph = (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" {...stroke} />
      </>
    );
  } else if (type.startsWith("VIP_") || type === "USER_VERIFIED" || type === "AHL_AL_KALIMA_UNLOCKED") {
    glyph = (
      <>
        <path d="M6 3h12l4 6-10 12L2 9l4-6Z" {...stroke} />
        <path d="M2 9h20" {...stroke} />
        <path d="m12 3 3 6-3 12-3-12 3-6Z" {...stroke} />
      </>
    );
  } else {
    glyph = (
      <>
        <circle cx="12" cy="12" r="9" {...stroke} />
        <path d="M12 8v4l3 2" {...stroke} />
      </>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `${color}14` }}
      aria-hidden
    >
      <svg width={size - 12} height={size - 12} viewBox="0 0 24 24">
        {glyph}
      </svg>
    </span>
  );
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

/* ===================== طبقة البيانات — SSE لحظي + دوري احتياطي ===================== */

function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pushState, setPushState] = useState<PushState>("unknown");
  const [enabling, setEnabling] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  const load = useCallback(async (): Promise<void> => {
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

  const refreshPushState = useCallback(async (): Promise<void> => {
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

    /* التحديث الدوري الاحتياطي + عند العودة للتبويب */
    const timer = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    /* القناة اللحظية SSE — تحديث العداد والتوست بلا إعادة تحميل */
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const connect = (): void => {
      if (disposed) return;
      try {
        es = new EventSource("/api/notifications/stream");
        es.onmessage = (ev: MessageEvent<string>) => {
          try {
            const data = JSON.parse(ev.data) as {
              unread?: number;
              isNewItem?: boolean;
              latest?: { id: string; title: string; message: string; link: string | null; type: string };
              heartbeat?: boolean;
            };
            if (typeof data.unread === "number") setUnread(data.unread);
            if (data.isNewItem && data.latest) {
              load();
              setToast({
                id: data.latest.id,
                type: data.latest.type,
                title: data.latest.title,
                message: data.latest.message,
                link: data.latest.link,
                isRead: false,
                readAt: null,
                createdAt: new Date().toISOString(),
              });
            }
          } catch {
            /* نبض تالف — يتجاهل */
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (!disposed) reconnect = setTimeout(connect, 5_000);
        };
      } catch {
        /* SSE غير مدعوم — الدورة الاحتياطية تغطي */
      }
    };
    connect();

    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      es?.close();
      if (reconnect) clearTimeout(reconnect);
    };
  }, [load, refreshPushState]);

  const enablePush = useCallback(async (): Promise<void> => {
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

  const markAll = useCallback(async (): Promise<void> => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }, []);

  const markOne = useCallback(async (id: string): Promise<void> => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const dismissToast = useCallback((): void => setToast(null), []);

  return { items, unread, authed, pushState, enabling, toast, load, enablePush, markAll, markOne, dismissToast };
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
        href="/auth/login"
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
      {items.map((n) => {
        const body = n.message.length > 110 ? `${n.message.slice(0, 110)}…` : n.message;
        const inner = (
          <span className="flex items-start gap-2.5">
            <TypeIcon type={n.type} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                <span className="text-xs font-bold leading-6" style={{ color: "var(--ink)" }}>
                  {n.title}
                </span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                {body}
              </span>
              <span className="mt-1 block text-[10px]" style={{ color: "var(--ink-muted)" }}>
                {timeAgo(n.createdAt)}
              </span>
            </span>
          </span>
        );
        const cls = "block rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--accent-soft)]";
        return (
          <li key={n.id}>
            {n.link ? (
              <Link
                href={n.link}
                onClick={() => {
                  if (!n.isRead) onMarkOne(n.id);
                  onNavigate?.();
                }}
                className={cls}
              >
                {inner}
              </Link>
            ) : (
              <button
                onClick={() => {
                  if (!n.isRead) onMarkOne(n.id);
                  onNavigate?.();
                }}
                className={`${cls} w-full text-right`}
              >
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ===================== التوست اللحظي — وصول إشعار أثناء التصفح ===================== */

export function NotificationToasts() {
  const { toast, dismissToast, markOne } = useNotifications();
  const [stack, setStack] = useState<NotificationItem[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!toast || seen.current.has(toast.id)) return;
    seen.current.add(toast.id);
    setStack((prev) => [toast, ...prev].slice(0, 3));
    const timer = setTimeout(() => {
      setStack((prev) => prev.filter((t) => t.id !== toast.id));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (stack.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {stack.map((t) => {
        const body = t.message.length > 90 ? `${t.message.slice(0, 90)}…` : t.message;
        const card = (
          <span className="flex items-start gap-2.5">
            <TypeIcon type={t.type} size={26} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold leading-5" style={{ color: "var(--ink)" }}>
                {t.title}
              </span>
              <span className="block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                {body}
              </span>
            </span>
          </span>
        );
        const cls = "pointer-events-auto block rounded-2xl border p-3 shadow-lift animate-fade-in transition-transform hover:-translate-y-0.5";
        return (
          <div
            key={t.id}
            className={cls}
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            role="status"
          >
            {t.link ? (
              <Link
                href={t.link}
                onClick={() => {
                  markOne(t.id);
                  setStack((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {card}
              </Link>
            ) : (
              <button
                className="w-full text-right"
                onClick={() => setStack((prev) => prev.filter((x) => x.id !== t.id))}
              >
                {card}
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={dismissToast}
        className="pointer-events-auto self-start text-[10px] font-bold"
        style={{ color: "var(--ink-muted)" }}
        aria-label="إخفاء التنبيهات"
      >
        إخفاء
      </button>
    </div>
  );
}

/** جرس الإشعارات في الهيدر — للحاسوب والتابلت فقط (يُخفى على الهواتف عبر CSS) */
export function NotificationBell() {
  const { items, unread, authed, pushState, enabling, enablePush, markAll, markOne } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
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

  const shown = tab === "all" ? items : items.filter((n) => !n.isRead);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        aria-expanded={open}
        title="الإشعارات"
        data-tour="notif-bell"
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

          {/* التبويبان: الكل / غير المقروءة */}
          <div
            className="mx-1 mb-1 grid grid-cols-2 gap-1 rounded-xl p-1"
            style={{ background: "var(--bg-soft)" }}
            role="tablist"
          >
            {(
              [
                ["all", `الكل${items.length ? ` (${items.length})` : ""}`],
                ["unread", `غير المقروءة${unread ? ` (${unread})` : ""}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className="rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all"
                style={
                  tab === key
                    ? { background: "var(--surface)", color: "var(--accent-strong)", boxShadow: "var(--shadow-soft)" }
                    : { color: "var(--ink-muted)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-contain">
            <NotificationList items={shown} onMarkOne={markOne} onNavigate={() => setOpen(false)} />
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
  const [tab, setTab] = useState<"all" | "unread">("all");

  const shown = tab === "all" ? items : items.filter((n) => !n.isRead);

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
            <div className="grid grid-cols-2 gap-1" role="tablist">
              {(
                [
                  ["all", "الكل"],
                  ["unread", "غير المقروءة"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className="rounded-lg px-3 py-1 text-[11px] font-bold"
                  style={
                    tab === key
                      ? { background: "var(--surface)", color: "var(--accent-strong)" }
                      : { color: "var(--ink-muted)" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
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
            <NotificationList items={shown} onMarkOne={markOne} />
          </div>
          <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <PushEnableRow authed={authed} pushState={pushState} enabling={enabling} onEnable={enablePush} />
          </div>
        </div>
      )}
    </div>
  );
}
