"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * لوحة «الأجهزة المتصلة» — إدارة جلسات الحساب من صفحة الملف الشخصي:
 * - قائمة كل الهواتف والمتصفحات التي دخلت إلى الحساب (الأحدث نشاطًا أولًا).
 * - تمييز الجهاز الحالي بعلامة خضراء «هذا الجهاز».
 * - زر «تسجيل الخروج من هذا الجهاز» لكل جهاز آخر: يحذف سجله من قاعدة
 *   البيانات فتموت جلسته فورًا (بوابة الجلسة تقارن البصمة كل طلب).
 */

type DeviceRow = {
  id: string;
  deviceHash: string;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  lastIp: string | null;
  location: string | null;
  lastActiveAt: string;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  mobile: "هاتف",
  tablet: "جهاز لوحي",
  desktop: "حاسوب",
};

const fmt = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function DeviceGlyph({ type }: { type: string | null }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "mobile") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    );
  }
  if (type === "tablet") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
        <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
        <path d="M11 17.8h2" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </svg>
  );
}

export function DevicesPanel() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [currentHash, setCurrentHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/profile/devices", { cache: "no-store" });
      if (res.status === 401) return;
      const data = (await res.json()) as { devices: DeviceRow[]; currentDeviceHash: string | null };
      setDevices(data.devices ?? []);
      setCurrentHash(data.currentDeviceHash ?? null);
    } catch {
      /* شبكة متقطعة */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (device: DeviceRow): Promise<void> => {
      const isCurrent = device.deviceHash === currentHash;
      const label = `${TYPE_LABELS[device.deviceType ?? ""] ?? "الجهاز"} — ${device.browser ?? ""} على ${device.os ?? ""}`;
      const confirmText = isCurrent
        ? "ستسجّل الخروج من الجهاز الذي تستخدمه الآن فورًا. هل أنت متأكد؟"
        : `ستُبطل جلسة «${label}» فورًا. هل أنت متأكد؟`;
      if (!window.confirm(confirmText)) return;

      setBusyHash(device.deviceHash);
      setMessage(null);
      try {
        const res = await fetch("/api/profile/devices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceHash: device.deviceHash }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "تعذر إبطال الجلسة");
        setDevices((prev) => prev.filter((d) => d.deviceHash !== device.deviceHash));
        if (isCurrent) {
          /* الجهاز الحالي أُبطلت جلسته — توديع نظيف إلى الرئيسية ثم دخول جديد */
          await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
          window.location.href = "/";
          return;
        }
        setMessage({ ok: true, text: `أُبطلت جلسة «${label}» فورًا` });
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : "تعذر إبطال الجلسة" });
      } finally {
        setBusyHash(null);
      }
    },
    [currentHash],
  );

  return (
    <div>
      <h2 className="text-lg font-extrabold" style={{ color: "var(--ink)" }}>
        الأجهزة المتصلة
      </h2>
      <p className="mt-1 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
        كل جهاز سجّل الدخول إلى حسابك يوثق هنا تلقائيًا — ويمكنك إبطال جلسة أي جهاز عن بُعد لحظةً واحدة، حتى جهاز لم تعتد رؤيته.
      </p>

      {message && (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-xs font-bold"
          style={{
            background: message.ok ? "rgba(60,122,78,0.12)" : "rgba(220,38,38,0.10)",
            color: message.ok ? "#3c7a4e" : "#DC2626",
          }}
          role="status"
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
          جارٍ جلب الأجهزة..
        </p>
      ) : devices.length === 0 ? (
        <p className="mt-4 text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
          لا أجهزة موثقة بعد — سجّل الدخول من جهاز وسيظهر هنا تلقائيًا.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {devices.map((d) => {
            const isCurrent = d.deviceHash === currentHash;
            const label = `${TYPE_LABELS[d.deviceType ?? ""] ?? "جهاز"} — ${d.browser ?? "متصفح"} على ${d.os ?? "نظام غير معروف"}`;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                style={{
                  borderColor: isCurrent ? "rgba(60,122,78,0.45)" : "var(--border)",
                  background: isCurrent ? "rgba(60,122,78,0.06)" : "transparent",
                }}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: isCurrent ? "rgba(60,122,78,0.14)" : "var(--bg-soft)",
                      color: isCurrent ? "#3c7a4e" : "var(--ink-muted)",
                    }}
                    aria-hidden
                  >
                    <DeviceGlyph type={d.deviceType} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-xs" style={{ color: "var(--ink)" }}>
                        {label}
                      </b>
                      {isCurrent && (
                        <span
                          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: "rgba(60,122,78,0.16)", color: "#3c7a4e" }}
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#3c7a4e" }} />
                          هذا الجهاز الحالي
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                      آخر نشاط: {fmt.format(new Date(d.lastActiveAt))}
                      {d.location ? ` — ${d.location}` : ""}
                      {d.lastIp ? ` — ${d.lastIp}` : ""}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => void revoke(d)}
                  disabled={busyHash === d.deviceHash}
                  className="rounded-xl border px-3 py-2 text-[11px] font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
                  style={
                    isCurrent
                      ? { borderColor: "rgba(220,38,38,0.35)", color: "#DC2626" }
                      : { borderColor: "var(--border)", color: "var(--ink-muted)" }
                  }
                >
                  {busyHash === d.deviceHash
                    ? "جارٍ الإبطال.."
                    : isCurrent
                      ? "تسجيل الخروج من هذا الجهاز"
                      : "إبطال جلسة هذا الجهاز"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
