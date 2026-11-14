"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pushSupported, subscribeToPush, resyncExistingSubscription } from "@/lib/push-client";

/**
 * مركز إشعارات القارئ التفاعلي — فوق الجدول المركزي الموحد (Notification):
 * - مخزن مشترك واحد (Singleton) بين الجرس بالهيدر ودرج الموبايل والتوست
 *   لمنع تكرار الطلبات من عدة مكونات مركبة في نفس الصفحة.
 * - استطلاع ذكي كل 60 ثانية للمسجلين فقط وحين يكون التبويب مرئيًا،
 *   بلا اتصالات SSE متكررة على الخادم اللامركزي.
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
  metadata?: { device?: string; location?: string; ip?: string | null; when?: string } | null;
};

type PushState = "unknown" | "unsupported" | "denied" | "off" | "on";

const SEEN_KEY = "last_seen_notification_id";
const POLL_INTERVAL_MS = 60_000;
const VISIBILITY_STALE_MS = 45_000;

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

/** التوقيت الدقيق الكامل — لبطاقة تفاصيل الإشعار */
const exactFmt = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});
function exactTime(iso: string): string {
  try {
    return exactFmt.format(new Date(iso));
  } catch {
    return iso;
  }
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

/* ===================== نافذة تفاصيل الإشعار — النص الكامل بلا اقتطاع ===================== */

export function NotificationDetailModal({
  item,
  onClose,
  onDismiss,
}: {
  item: NotificationItem;
  onClose: () => void;
  onDismiss?: (item: NotificationItem) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const typeMeta = typeIconMeta(item.type);
  const meta = item.metadata ?? null;
  const title = item.title ?? "إشعار";
  const message = item.message ?? "";

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fixed top-1/2 left-1/2 flex max-h-[80dvh] w-[90vw] -translate-x-1/2 -translate-y-1/2 animate-fade-in flex-col overflow-hidden rounded-2xl border shadow-lift sm:max-w-md md:max-w-lg lg:max-w-xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <TypeIcon type={item.type} size={28} />
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
              style={{ background: `${typeMeta.color}18`, color: typeMeta.color }}
            >
              {typeMeta.label}
            </span>
            {!item.isRead && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                جديد
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            aria-label="إغلاق التفاصيل"
            className="shrink-0 rounded-full p-1.5 text-lg leading-none transition-colors hover:bg-(--accent-soft)"
            style={{ color: "var(--ink-muted)" }}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <h3 className="text-base font-extrabold leading-8" style={{ color: "var(--ink)" }}>
            {title}
          </h3>
          <p
            className="mt-2 whitespace-pre-line wrap-break-word text-sm leading-8"
            style={{ color: "var(--ink-muted)" }}
          >
            {message}
          </p>

          {meta && (meta.device || meta.location || meta.ip || meta.when) && (
            <div
              className="mt-4 space-y-1.5 rounded-xl p-3 text-[11px] leading-6"
              style={{ background: "var(--bg-soft)", color: "var(--ink-muted)" }}
            >
              {meta.device && (
                <div>
                  <b style={{ color: "var(--ink)" }}>الجهاز:</b> {meta.device}
                </div>
              )}
              {meta.location && (
                <div>
                  <b style={{ color: "var(--ink)" }}>الموقع التقريبي:</b> {meta.location}
                </div>
              )}
              {meta.ip && (
                <div>
                  <b style={{ color: "var(--ink)" }}>عنوان الشبكة:</b> {meta.ip}
                </div>
              )}
              {meta.when && (
                <div>
                  <b style={{ color: "var(--ink)" }}>وقت الحدث:</b> {meta.when}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-[11px]" style={{ color: "var(--ink-muted)" }}>
            {exactTime(item.createdAt)}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          {item.link ? (
            <Link
              href={item.link}
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              الانتقال إلى الحدث
            </Link>
          ) : (
            <span />
          )}
          {onDismiss && (
            <button
              onClick={() => {
                onDismiss(item);
                onClose();
              }}
              className="text-xs font-bold underline underline-offset-4 transition-opacity hover:opacity-70"
              style={{ color: "var(--ink-muted)" }}
            >
              إخفاء هذا الإشعار نهائيًا
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ===================== المخزن المشترك (Singleton) — طلب واحد لكل التبويب ===================== */

type StoreState = {
  items: NotificationItem[];
  unread: number;
  authed: boolean | null;
  pushState: PushState;
  enabling: boolean;
  toast: NotificationItem | null;
  detail: NotificationItem | null;
};

let store: StoreState = {
  items: [],
  unread: 0,
  authed: null,
  pushState: "unknown",
  enabling: false,
  toast: null,
  detail: null,
};

const listeners = new Set<() => void>();
let activeMounts = 0;
let lastFetchAt = 0;
let inflightLoad: Promise<void> | null = null;
let baselineReady = false;
let prevUnread = 0;
let resyncedSession = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function setStore(patch: Partial<StoreState>): void {
  store = { ...store, ...patch };
  listeners.forEach((fn) => fn());
}

async function fetchNotifications(): Promise<void> {
  if (inflightLoad) return inflightLoad;
  inflightLoad = (async () => {
    lastFetchAt = Date.now();
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        setStore({ authed: false, items: [], unread: 0 });
        baselineReady = false;
        prevUnread = 0;
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { items?: NotificationItem[]; unread?: number };
      const newItems = data.items ?? [];
      const newUnread = data.unread ?? 0;

      let nextToast = store.toast;
      if (baselineReady && newUnread > prevUnread && newItems.length > 0) {
        const latest = newItems[0];
        let seenId: string | null = null;
        try {
          seenId = localStorage.getItem(SEEN_KEY);
        } catch {
          /* التخزين محجوب */
        }
        if (latest.id && seenId !== latest.id) {
          try {
            localStorage.setItem(SEEN_KEY, latest.id);
          } catch {
            /* صامت */
          }
          nextToast = {
            ...latest,
            type: latest.type ?? "system",
            title: latest.title ?? "إشعار جديد",
            message: latest.message ?? "",
            link: latest.link ?? null,
          };
        }
      }

      baselineReady = true;
      prevUnread = newUnread;
      setStore({
        authed: true,
        items: newItems,
        unread: newUnread,
        toast: nextToast,
      });

      if (!resyncedSession) {
        resyncedSession = true;
        void resyncExistingSubscription();
      }
    } catch {
      /* الشبكة متقطعة — يُعاد المحاولة في الدورة التالية */
    } finally {
      inflightLoad = null;
    }
  })();
  return inflightLoad;
}

async function refreshPushStateShared(): Promise<void> {
  if (!pushSupported()) {
    setStore({ pushState: "unsupported" });
    return;
  }
  try {
    if (Notification.permission === "denied") {
      setStore({ pushState: "denied" });
      return;
    }
    if (Notification.permission !== "granted") {
      setStore({ pushState: "off" });
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    setStore({ pushState: sub ? "on" : "off" });
  } catch {
    setStore({ pushState: "off" });
  }
}

function onVisibilityChange(): void {
  if (
    document.visibilityState === "visible" &&
    store.authed === true &&
    Date.now() - lastFetchAt >= VISIBILITY_STALE_MS
  ) {
    void fetchNotifications();
  }
}

function startPollingLoop(): void {
  if (pollTimer) return;
  void fetchNotifications();
  void refreshPushStateShared();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible" && store.authed === true) {
      void fetchNotifications();
    }
  }, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function stopPollingLoop(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

function useNotifications() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    activeMounts += 1;
    if (activeMounts === 1) {
      startPollingLoop();
    }
    return () => {
      listeners.delete(listener);
      activeMounts = Math.max(0, activeMounts - 1);
      if (activeMounts === 0) {
        stopPollingLoop();
      }
    };
  }, []);

  const enablePush = useCallback(async (): Promise<void> => {
    setStore({ enabling: true });
    try {
      const result = await subscribeToPush();
      if (result.ok) setStore({ pushState: "on" });
      else if (result.reason === "denied") setStore({ pushState: "denied" });
      else if (result.reason === "unsupported") setStore({ pushState: "unsupported" });
    } finally {
      setStore({ enabling: false });
    }
  }, []);

  const markAll = useCallback(async (): Promise<void> => {
    const now = new Date().toISOString();
    prevUnread = 0;
    setStore({
      items: store.items.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? now })),
      unread: 0,
    });
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }, []);

  const markOne = useCallback(async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    const nextUnread = Math.max(0, store.unread - 1);
    prevUnread = nextUnread;
    setStore({
      items: store.items.map((n) => (n.id === id ? { ...n, isRead: true, readAt: n.readAt ?? now } : n)),
      unread: nextUnread,
    });
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const dismiss = useCallback(async (item: NotificationItem): Promise<void> => {
    const nextUnread = item.isRead ? store.unread : Math.max(0, store.unread - 1);
    prevUnread = nextUnread;
    setStore({
      unread: nextUnread,
      items: store.items.filter((n) => n.id !== item.id),
      detail: store.detail?.id === item.id ? null : store.detail,
      toast: store.toast?.id === item.id ? null : store.toast,
    });
    try {
      localStorage.setItem(SEEN_KEY, item.id);
    } catch {
      /* صامت */
    }
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action: "dismiss" }),
    }).catch(() => {});
  }, []);

  const openDetail = useCallback(
    (item: NotificationItem): void => {
      setStore({ detail: item });
      if (!item.isRead) void markOne(item.id);
    },
    [markOne],
  );

  const dismissToast = useCallback((): void => setStore({ toast: null }), []);
  const closeDetail = useCallback((): void => setStore({ detail: null }), []);

  return {
    items: store.items,
    unread: store.unread,
    authed: store.authed,
    pushState: store.pushState,
    enabling: store.enabling,
    toast: store.toast,
    detail: store.detail,
    load: fetchNotifications,
    enablePush,
    markAll,
    markOne,
    dismiss,
    openDetail,
    dismissToast,
    closeDetail,
  };
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
        className="block rounded-xl px-3 py-2.5 text-center text-xs font-bold transition-colors hover:bg-(--accent-soft)"
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
  onOpen,
  onDismiss,
}: {
  items: NotificationItem[];
  onOpen: (item: NotificationItem) => void;
  onDismiss: (item: NotificationItem) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        لا إشعارات بعد.. جديد المنصة وتحديثاتها سيصلك هنا فورًا.
      </p>
    );
  }
  return (
    <ul>
      {items.map((n) => (
        <li key={n.id} className="relative">
          <button
            onClick={() => onOpen(n)}
            className="block w-full rounded-xl px-3 py-2.5 pl-8 text-right transition-colors hover:bg-(--accent-soft)"
          >
            <span className="flex items-start gap-2.5">
              <TypeIcon type={n.type} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
                  <span className="text-xs font-bold leading-6" style={{ color: "var(--ink)" }}>
                    {n.title ?? "إشعار"}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                  {n.message ?? ""}
                </span>
                <span className="mt-1 block text-[10px]" style={{ color: "var(--ink-muted)" }}>
                  {timeAgo(n.createdAt)}
                </span>
              </span>
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(n);
            }}
            aria-label={`إخفاء إشعار: ${n.title}`}
            title="إخفاء نهائي"
            className="absolute left-1.5 top-2 rounded-full p-1.5 text-[11px] leading-none transition-colors hover:bg-(--accent-soft)"
            style={{ color: "var(--ink-muted)" }}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ===================== التوست اللحظي — للحدث الحي الجديد حصرًا ===================== */

export function NotificationToasts() {
  const { toast, dismissToast, dismiss, openDetail, detail, closeDetail } = useNotifications();
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

  if (stack.length === 0 && !detail) return null;
  return (
    <>
      {stack.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-90 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
          {stack.map((t) => {
            const rawMsg = t.message ?? "";
            const body = rawMsg.length > 90 ? `${rawMsg.slice(0, 90)}…` : rawMsg;
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
            return (
              <div
                key={t.id}
                className="pointer-events-auto relative block rounded-2xl border p-3 pl-9 shadow-lift animate-fade-in transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                role="status"
              >
                <button
                  className="block w-full text-right"
                  onClick={() => {
                    openDetail(t);
                    setStack((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                >
                  {card}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void dismiss(t);
                    setStack((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  aria-label={`إخفاء إشعار: ${t.title}`}
                  title="إخفاء نهائي"
                  className="absolute left-1.5 top-1.5 rounded-full p-1.5 text-[11px] leading-none transition-colors hover:bg-(--accent-soft)"
                  style={{ color: "var(--ink-muted)" }}
                >
                  ✕
                </button>
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
      )}
      {detail && <NotificationDetailModal item={detail} onClose={closeDetail} onDismiss={dismiss} />}
    </>
  );
}

/** جرس الإشعارات في الهيدر — نسخة الحاسوب والتابلت فقط (تُخفى على الهاتف عبر CSS) */
export function NotificationBell() {
  const {
    items, unread, authed, pushState, enabling, enablePush,
    markAll, dismiss, openDetail, detail, closeDetail,
  } = useNotifications();
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
        className="relative rounded-full p-2 transition-all hover:scale-110 hover:bg-(--accent-soft)"
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
            <NotificationList items={shown} onOpen={openDetail} onDismiss={dismiss} />
          </div>
          <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <PushEnableRow authed={authed} pushState={pushState} enabling={enabling} onEnable={enablePush} />
          </div>
        </div>
      )}

      {detail && <NotificationDetailModal item={detail} onClose={closeDetail} onDismiss={dismiss} />}
    </div>
  );
}

/** بند الإشعارات البارز داخل درج الموبايل — الحصرية الهاتفية للجرس */
export function DrawerNotifications() {
  const {
    items, unread, authed, pushState, enabling, enablePush,
    markAll, dismiss, openDetail, detail, closeDetail,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const shown = tab === "all" ? items : items.filter((n) => !n.isRead);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors active:bg-(--accent-soft)"
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
            <NotificationList items={shown} onOpen={openDetail} onDismiss={dismiss} />
          </div>
          <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <PushEnableRow authed={authed} pushState={pushState} enabling={enabling} onEnable={enablePush} />
          </div>
        </div>
      )}

      {detail && <NotificationDetailModal item={detail} onClose={closeDetail} onDismiss={dismiss} />}
    </div>
  );
}
