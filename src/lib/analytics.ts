/**
 * طبقة التحليلات الخفيفة — تتبع الزيارات والقراءة المتكاملة والمشاركات
 * بدون أي كوكيز تتبع أو أطراف ثالثة. sendBeacon مع fallback fetch keepalive.
 */

const SESSION_KEY = "kalam_sid";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sid-${Date.now().toString(36)}`;
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `sid-${Date.now().toString(36)}`;
  }
}

type AnalyticsPayload = {
  type: "view" | "complete" | "dwell" | "share";
  articleId?: string;
  path?: string;
  viewId?: string;
  readSeconds?: number;
  platform?: string;
  quoteLen?: number;
};

/** نوع الجهاز من سلسلة المتصفح — يغذي لوحة تحليلات الأداء في لوحة التحكم */
function getDeviceType(): string {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(ua)) return "tablet";
  if (/mobi|iphone|android.*mobile|windows phone/.test(ua)) return "mobile";
  if (/android/.test(ua)) return "tablet";
  return "desktop";
}

export function track(payload: AnalyticsPayload): void {
  if (typeof window === "undefined") return;
  const fp =
    window.localStorage.getItem("kalam_fp") ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "");
  if (fp && !window.localStorage.getItem("kalam_fp")) {
    try { window.localStorage.setItem("kalam_fp", fp); } catch {}
  }
  const body = JSON.stringify({ ...payload, device: getDeviceType(), sessionId: getSessionId(), fp });

  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/analytics", blob)) return;
  } catch {}

  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** تتبع زيارة صفحة — يعيد viewId لربط أحداث الإكمال */
export async function trackView(articleId: string | null, path: string): Promise<string | null> {
  track({ type: "view", articleId: articleId ?? undefined, path });
  // viewId يعاد من الخادم عند توفره
  try {
    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "view",
        articleId: articleId ?? undefined,
        path,
        device: getDeviceType(),
        sessionId: getSessionId(),
        fp: window.localStorage.getItem("kalam_fp") || undefined,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { viewId?: string };
      return data.viewId ?? null;
    }
  } catch {}
  return null;
}

export function trackComplete(viewId: string | null, readSeconds: number, articleId?: string): void {
  track({ type: "complete", viewId: viewId ?? undefined, readSeconds, articleId });
}

export function trackDwell(viewId: string | null, readSeconds: number): void {
  track({ type: "dwell", viewId: viewId ?? undefined, readSeconds });
}

export function trackShare(articleId: string, platform: string, quoteLen?: number): void {
  track({ type: "share", articleId, platform, quoteLen });
}
