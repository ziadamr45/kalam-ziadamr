"use client";

/**
 * أدوات المتصفح للاشتراك في إشعارات الويب الفورية (Web Push).
 * تُستخدم في جرس الإشعارات بالهيدر وبند الإشعارات بدرج الموبايل.
 */

const PUSH_SYNC_KEY = "kalam_push_synced_v1";
const PUSH_SYNC_TTL_MS = 24 * 60 * 60 * 1000;
let inflightResync: Promise<void> | null = null;

function markPushSynced(endpoint: string): void {
  try {
    localStorage.setItem(PUSH_SYNC_KEY, JSON.stringify({ endpoint, ts: Date.now() }));
  } catch {
    /* التخزين محجوب */
  }
}

function clearPushSynced(): void {
  try {
    localStorage.removeItem(PUSH_SYNC_KEY);
  } catch {
    /* التخزين محجوب */
  }
}

function isRecentlySynced(endpoint: string): boolean {
  try {
    const raw = localStorage.getItem(PUSH_SYNC_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { endpoint?: string; ts?: number };
    return (
      parsed.endpoint === endpoint &&
      typeof parsed.ts === "number" &&
      Date.now() - parsed.ts < PUSH_SYNC_TTL_MS
    );
  } catch {
    return false;
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** تحويل مفتاح VAPID العام من Base64URL إلى Uint8Array كما يتطلب المتصفح */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type SubscribeResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

/** طلب الإذن وإنشاء الاشتراك وحفظه في القاعدة مربوطًا بالحساب */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };
  try {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return { ok: false, reason: "failed" };
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "failed" };
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, reason: "failed" };
    markPushSynced(json.endpoint);
    return { ok: true, endpoint: json.endpoint };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** إلغاء الاشتراك من المتصفح ومن القاعدة */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    clearPushSynced();
    return true;
  } catch {
    return false;
  }
}

/**
 * مزامنة صامتة لاشتراك قائم — محمية بحارس 24 ساعة ومنع التكرار المتزامن
 * حتى لا تُغرق الخادم بطلبات POST متكررة عند كل تنقل أو إعادة رندر.
 */
export async function resyncExistingSubscription(): Promise<void> {
  if (!pushSupported()) return;
  if (inflightResync) return inflightResync;
  inflightResync = (async () => {
    try {
      if (Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) return;
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      if (isRecentlySynced(json.endpoint)) return;
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (res.ok) markPushSynced(json.endpoint);
    } catch {
      /* صامت */
    } finally {
      inflightResync = null;
    }
  })();
  return inflightResync;
}
