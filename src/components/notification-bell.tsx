"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pushSupported, subscribeToPush, resyncExistingSubscription } from "@/lib/push-client";

/**
 * مركز إشعارات القارئ التفاعلي — فوق الجدول المركزي الموحد (Notification):
 * - جرس تفاعلي بالهيدر بعداد رقمي حي (SSE لحظيًا + تحديث دوري احتياطي).
 * - نافذة منسدلة بتبويبين: «الكل» و«غير المقروءة» مع تعليم الكل كمقروء.
 * - مؤشرات أيقونية ملونة بحسب طبيعة الحدث (نجمة الأثر، فقاعة النقاش،
 *   درع الأمان، ماسة التوثيق، بوق النشر).
 * - توست لحظي (NotificationToasts) للحدث الحي الواقع أثناء التصفح فقط —
 *   لا إعادة إطلاق للإشعارات القديمة عند أي ريفريش (خط أساس صامت + حارس
 *   last_seen_notification_id في localStorage).
 * - زر إخفاء (X) على كل إشعار: حذف تفاؤلي فوري من الواجهة + dismissedAt
 *   في قاعدة البيانات (يخرج من القائمة والعداد نهائيًا مع بقاء التوثيق).
 * - نقر أي إشعار يفتح نافذة التفاصيل الكاملة: النص كاملًا دون اقتطاع +
 *   بادج النوع + التوقيت الدقيق + زر الانتقال للرابط + تعليم تلقائي كمقروء.
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

  /* ============ Portal إلى document.body — الإصلاح الجذري للتوسيط ============
     كان المودال يُرندر داخل الهيدر (backdrop-blur) وداخل الدرج (transform) —
     أي سلف بهذه الخصائص يجعل عنصر fixed يتموضع نسبةً إليه لا نسبةً للشاشة،
     فيلتصق بأعلى الصفحة ويُقص على التابلت والكمبيوتر. النقل عبر Portal
     يعتقه من كل سلاسل الأسلاف، والتوسيط مطلق مع تمرير داخلي آمن. */
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* لوحة متمركزة حرفيًا (top/left 1/2 + translate) ببنية عمودية صارمة:
          رأس وتذييل ثابتان (shrink-0) والمتن يتمرر وحده (flex-1) داخل سقف 80vh */}
      <div
        className="fixed top-1/2 left-1/2 flex max-h-[80vh] w-[90vw] -translate-x-1/2 -translate-y-1/2 animate-fade-in flex-col overflow-hidden rounded-2xl border shadow-lift sm:max-w-md md:max-w-lg lg:max-w-xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس ثابت — النوع والبادج وزر الإغلاق */}
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
            className="shrink-0 rounded-full p-1.5 text-lg leading-none transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* المتن المتمرر — العنوان والنص الكامل والتوقيت والسياق (flex-1 داخل سقف 80vh) */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <h3 className="text-base font-extrabold leading-8" style={{ color: "var(--ink)" }}>
            {title}
          </h3>
          <p
            className="mt-2 whitespace-pre-line break-words text-sm leading-8"
            style={{ color: "var(--ink-muted)" }}
          >
            {message}
          </p>

          {/* تفاصيل سياقية إضافية (أجهزة/مواقع لإشعارات الأمان) */}
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

        {/* تذييل ثابت — الانتقال للرابط والإخفاء */}
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

/* ===================== طبقة البيانات — SSE لحظي + دوري احتياطي ===================== */

function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pushState, setPushState] = useState<PushState>("unknown");
  const [enabling, setEnabling] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [detail, setDetail] = useState<NotificationItem | null>(null);

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

    /* القناة اللحظية SSE — تحديث العداد والتوست بلا إعادة تحميل.
       النبضة الأولى من الخادم تحمل isNewItem:false دائمًا (خط أساس صامت)،
       وحارس localStorage يمنع أي إعادة إطلاق لإشعار شُوهد من قبل —
       فلا توست عند الرفريش مهما تكرر، بل للحدث الحي الجديد حصرًا. */
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
              /* حارس التكرار النهائي: إشعار شُوهد سابقًا لا يُعرض توستًا مطلقًا */
              let seenId: string | null = null;
              try {
                seenId = localStorage.getItem(SEEN_KEY);
              } catch {
                /* التخزين محجوب — نكمل بلا حارس */
              }
              const latestId = data.latest.id ?? "";
              if (!latestId || seenId === latestId) return;
              try {
                localStorage.setItem(SEEN_KEY, latestId);
              } catch {
                /* صامت */
              }
              /* تحصين الشكل: أي حقل ناقص من قناة SSE لا يُسقط الواجهة أبدًا
                 (درس انهيار e.message.length في الإنتاج) */
              setToast({
                id: latestId,
                type: data.latest.type ?? "system",
                title: data.latest.title ?? "إشعار جديد",
                message: data.latest.message ?? "",
                link: data.latest.link ?? null,
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

  /** الإخفاء النهائي — حذف تفاؤلي فوري من القائمة + dismissedAt في قاعدة البيانات */
  const dismiss = useCallback(async (item: NotificationItem): Promise<void> => {
    if (!item.isRead) setUnread((u) => Math.max(0, u - 1));
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    setDetail((d) => (d?.id === item.id ? null : d));
    setToast((t) => (t?.id === item.id ? null : t));
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

  /** فتح التفاصيل — تعليم تلقائي كمقروء لحظة الفتح مع تحديث العداد */
  const openDetail = useCallback(
    (item: NotificationItem): void => {
      setDetail(item);
      if (!item.isRead) void markOne(item.id);
    },
    [markOne],
  );

  const dismissToast = useCallback((): void => setToast(null), []);

  return {
    items, unread, authed, pushState, enabling, toast, detail,
    load, enablePush, markAll, markOne, dismiss, openDetail, dismissToast,
    closeDetail: () => setDetail(null),
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
            className="block w-full rounded-xl px-3 py-2.5 pl-8 text-right transition-colors hover:bg-[var(--accent-soft)]"
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
          {/* زر الإخفاء النهائي — لا يفتح التفاصيل أبدًا (إيقاف التتابع) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(n);
            }}
            aria-label={`إخفاء إشعار: ${n.title}`}
            title="إخفاء نهائي"
            className="absolute left-1.5 top-2 rounded-full p-1.5 text-[11px] leading-none transition-colors hover:bg-[var(--accent-soft)]"
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
  const { toast, dismissToast, markOne, dismiss, openDetail, detail, closeDetail } = useNotifications();
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
        <div className="pointer-events-none fixed bottom-4 left-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
          {stack.map((t) => {
            /* تحصين مزدوج: نص التوست صلب دائمًا — أي شكل ناقص لا يُسقط الصفحة */
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
                    /* النقر يفتح التفاصيل الكاملة — والرسالة تعلّم كمقروء تلقائيًا */
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
                  className="absolute left-1.5 top-1.5 rounded-full p-1.5 text-[11px] leading-none transition-colors hover:bg-[var(--accent-soft)]"
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
