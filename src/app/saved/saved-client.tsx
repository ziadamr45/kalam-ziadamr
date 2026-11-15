"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { getOfflineArticles, removeOfflineArticle, saveOfflineArticle } from "@/lib/indexeddb";
import type { OfflineArticle } from "@/types/offline";
import { formatArabicDate } from "@/lib/utils";
import { formatReadingTime } from "@/lib/readingTime";

/* محفوظ من حساب القارئ (متزامن عبر الأجهزة) */
type AccountSave = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  readingTimeSec: number;
  publishedAt: string | null;
  savedAt: string;
  sectionName: string | null;
  sectionSlug: string | null;
};

type LibraryTab = "cloud" | "device";

/* شارة الحالة البصرية — سحابة للحفظ السحابي، هاتف لنسخة الجهاز */
function StateBadge({ kind }: { kind: "cloud" | "device" }) {
  const isCloud = kind === "cloud";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold"
      style={{
        background: isCloud ? "var(--accent-soft)" : "var(--bg-soft)",
        color: isCloud ? "var(--accent-strong)" : "var(--ink-muted)",
        borderColor: isCloud ? "var(--accent)" : "var(--border)",
      }}
      title={isCloud ? "محفوظ في حسابك — متزامن عبر كل أجهزتك" : "محفوظ على هذا الجهاز — متاح دون إنترنت"}
    >
      {isCloud ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6.5 6.5 0 0 0-12.7 1.74A4 4 0 0 0 6 19.5h11.5z" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18.5h2" />
        </svg>
      )}
      {isCloud ? "في الحساب" : "على هذا الجهاز"}
    </span>
  );
}

function SaveCard({
  title,
  summary,
  meta,
  href,
  onRemove,
  removeLabel,
  badges,
  action,
}: {
  title: string;
  summary: string;
  meta: string;
  href: string;
  onRemove: () => void;
  removeLabel: string;
  badges?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border p-5 shadow-soft sm:p-6" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* شارات الحالة الفورية: سحابة = الحساب المتزامن، هاتف = نسخة هذا الجهاز */}
          {badges && <div className="mb-2.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
          <Link href={href} className="font-body text-lg font-bold leading-8 hover:underline" style={{ color: "var(--ink)" }}>
            {title}
          </Link>
          <p className="mt-2 line-clamp-2 text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
            {summary}
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
            {meta}
          </p>
          {action && <div className="mt-4">{action}</div>}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-(--accent-soft)"
          style={{ color: "#b4443c" }}
        >
          {removeLabel}
        </button>
      </div>
    </li>
  );
}

export default function SavedClient() {
  const { status } = useSession();

  /* شبكة الترطيب (Hydration Guard): أول رسم على السيرفر وأول رسم على
     الكلاينت متطابقان حرفيًا — لا تُعرض أي واجهة تعتمد حالة الجلسة قبل
     اكتمال الترطيب، فمهما تصرف مزوّد الجلسة (loading/unauthenticated)
     يبقى ناتج SSR مطابقًا لأول رسم كلاينتي بلا خطأ توافق */
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loggedIn = isMounted && status === "authenticated";
  const authPending = !isMounted || status === "loading";

  const [tab, setTab] = useState<LibraryTab>("device");
  const [saves, setSaves] = useState<AccountSave[] | null>(null);
  const [device, setDevice] = useState<OfflineArticle[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  /* المسجلون يفتتحون من تبويب مكتبة الحساب المتزامنة */
  useEffect(() => {
    if (status === "authenticated") setTab("cloud");
  }, [status]);

  /* محفوظات الحساب من قاعدة البيانات */
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/saves")
      .then((r) => (r.ok ? r.json() : { saves: [] }))
      .then((d) => setSaves(d.saves ?? []))
      .catch(() => setSaves([]));
  }, [status]);

  /* محفوظات الجهاز (نسخ للقراءة دون اتصال) */
  const refreshDevice = useCallback(() => {
    getOfflineArticles()
      .then(setDevice)
      .catch(() => setDevice([]));
  }, []);
  useEffect(() => {
    refreshDevice();
  }, [refreshDevice]);

  const cloudIds = new Set((saves ?? []).map((s) => s.id));
  const deviceIds = new Set((device ?? []).map((a) => a.id));

  /* إزالة من الحساب فقط — لا تمس نسخة الجهاز (فصل القناتين) */
  const removeAccount = async (id: string) => {
    setSaves((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    await fetch("/api/saves", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: id }),
    }).catch(() => {});
  };

  /* إزالة نسخة الجهاز فقط — لا تمس مكتبة الحساب (فصل القناتين) */
  const removeDevice = async (id: string) => {
    await removeOfflineArticle(id);
    setDevice((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  };

  /* تنزيل مقال سحابي إلى ذاكرة هذا الجهاز للقراءة دون إنترنت */
  const downloadOffline = async (id: string) => {
    setBusyId(id);
    setNote("");
    try {
      const res = await fetch(`/api/offline-snapshot?id=${encodeURIComponent(id)}`);
      const data = (await res.json().catch(() => null)) as { snapshot?: OfflineArticle } | null;
      if (!res.ok || !data?.snapshot) {
        setNote("تعذر تنزيل المقال الآن — أعد المحاولة");
      } else {
        await saveOfflineArticle(data.snapshot);
        refreshDevice();
        setNote("نُزّل المقال إلى هذا الجهاز — متاح دون إنترنت");
      }
    } catch {
      setNote("تعذر تنزيل المقال الآن — أعد المحاولة");
    }
    setBusyId(null);
  };

  /* مزامنة مقال الجهاز مع مكتبة الحساب */
  const syncToAccount = async (id: string) => {
    setBusyId(id);
    setNote("");
    try {
      const res = await fetch("/api/saves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: id }),
      });
      if (res.ok) {
        const d = await fetch("/api/saves")
          .then((r) => (r.ok ? r.json() : { saves: [] }))
          .catch(() => ({ saves: [] }));
        setSaves(d.saves ?? []);
        setNote("تمت المزامنة مع حسابك — متاحة عبر كل أجهزتك");
      } else {
        setNote("تعذرت المزامنة الآن — أعد المحاولة");
      }
    } catch {
      setNote("تعذرت المزامنة الآن — أعد المحاولة");
    }
    setBusyId(null);
  };

  const actionBtn =
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors hover:bg-(--accent-soft) disabled:opacity-60";

  return (
    <>
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-20 pb-6 text-center sm:px-6 sm:pt-24">
          <h1 className="font-body text-2xl font-bold leading-[1.6] sm:text-3xl" style={{ color: "var(--ink)" }}>
            قراءاتي المحفوظة
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
            {authPending
              ? "جارٍ التحميل.."
              : loggedIn
                ? "قناتا حفظ مستقلتان: مكتبة حسابك المتزامنة عبر الأجهزة، ومقالات هذا الجهاز للقراءة دون إنترنت"
                : "محفوظة داخل جهازك — سجّل الدخول لتتزامن عبر كل أجهزتك"}
          </p>
        </section>

        {!authPending && (
          <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
            {/* ============ تبويبا القناتين — مقسم بالتساوي بدون تمرير أفقي على الهاتف ============ */}
            <div
              className="mb-6 grid grid-cols-2 gap-1.5 rounded-2xl border p-1.5 shadow-soft"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              role="tablist"
              aria-label="قنوات الحفظ"
            >
              <button
                role="tab"
                aria-selected={tab === "cloud"}
                onClick={() => setTab("cloud")}
                className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-xs font-bold leading-snug transition-all"
                style={
                  tab === "cloud"
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "transparent", color: "var(--ink-muted)" }
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d="M17.5 19a4.5 4.5 0 0 0 .42-8.98 6.5 6.5 0 0 0-12.7 1.74A4 4 0 0 0 6 19.5h11.5z" />
                </svg>
                <span>في حسابي{saves ? ` (${new Intl.NumberFormat("ar-EG").format(saves.length)})` : ""}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "device"}
                onClick={() => setTab("device")}
                className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-xs font-bold leading-snug transition-all"
                style={
                  tab === "device"
                    ? { background: "var(--accent)", color: "#fff" }
                    : { background: "transparent", color: "var(--ink-muted)" }
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <rect x="7" y="2" width="10" height="20" rx="2" />
                  <path d="M11 18.5h2" />
                </svg>
                <span>على الجهاز{device ? ` (${new Intl.NumberFormat("ar-EG").format(device.length)})` : ""}</span>
              </button>
            </div>

            {note && (
              <p
                className="mb-4 rounded-xl border px-4 py-2.5 text-center text-xs font-semibold"
                style={{ borderColor: "var(--border)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                role="status"
              >
                {note}
              </p>
            )}

            {/* ============ تبويب الحفظ المتزامن (في الحساب) ============ */}
            {tab === "cloud" && (
              <div>
                {!loggedIn ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm leading-8" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                    مكتبة الحساب تتطلب تسجيل الدخول —{" "}
                    <Link href="/auth/login?callback=/saved" className="underline" style={{ color: "var(--accent-strong)" }}>
                      سجّل الدخول بحساب Google
                    </Link>
                  </div>
                ) : saves === null ? (
                  <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                    جارٍ التحميل..
                  </p>
                ) : saves.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                    لا شيء في مكتبة حسابك بعد — اضغط «حفظ» في أي مقال واختر «حفظ في حسابي».
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {saves.map((s) => {
                      const onDevice = deviceIds.has(s.id);
                      return (
                        <SaveCard
                          key={s.id}
                          title={s.title}
                          summary={s.summary}
                          meta={`حُفظ في ${formatArabicDate(new Date(s.savedAt))}${s.sectionName ? ` · ${s.sectionName}` : ""} · ${formatReadingTime(s.readingTimeSec)}`}
                          href={`/article/${s.slug}`}
                          onRemove={() => void removeAccount(s.id)}
                          removeLabel="إزالة من الحساب"
                          badges={<StateBadge kind="cloud" />}
                          action={
                            onDevice ? (
                              <StateBadge kind="device" />
                            ) : (
                              <button
                                onClick={() => void downloadOffline(s.id)}
                                disabled={busyId === s.id}
                                className={actionBtn}
                                style={{ borderColor: "var(--accent)", color: "var(--accent-strong)" }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                                  <path d="M4 19h16" />
                                </svg>
                                {busyId === s.id ? "جارٍ التنزيل.." : "تنزيل للقراءة بدون إنترنت على هذا الجهاز"}
                              </button>
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* ============ تبويب الحفظ على هذا الجهاز ============ */}
            {tab === "device" && (
              <div>
                {device === null ? (
                  <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                    جارٍ التحميل..
                  </p>
                ) : device.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                    <p className="font-body text-base leading-8">
                      لم تُحفظ مقالات على هذا الجهاز بعد..
                      <br />
                      اضغط «حفظ» في أي مقال يعجبك واختر «حفظ على هذا الجهاز».
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {device.map((a) => {
                      const inCloud = cloudIds.has(a.id);
                      return (
                        <SaveCard
                          key={a.id}
                          title={a.title}
                          summary={a.summary}
                          meta={`متاح دون إنترنت · ${formatReadingTime(a.readingTimeSec)}`}
                          href={`/article/${a.slug}`}
                          onRemove={() => void removeDevice(a.id)}
                          removeLabel="إزالة من الجهاز"
                          badges={<StateBadge kind="device" />}
                          action={
                            inCloud ? (
                              <StateBadge kind="cloud" />
                            ) : loggedIn ? (
                              <button
                                onClick={() => void syncToAccount(a.id)}
                                disabled={busyId === a.id}
                                className={actionBtn}
                                style={{ borderColor: "var(--accent)", color: "var(--accent-strong)" }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 17V5" />
                                  <path d="m7 10 5-5 5 5" />
                                  <path d="M4 21h16" />
                                </svg>
                                {busyId === a.id ? "جارٍ المزامنة.." : "مزامنة مع حسابي"}
                              </button>
                            ) : (
                              <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                                <Link href="/auth/login?callback=/saved" className="underline" style={{ color: "var(--accent-strong)" }}>
                                  سجّل الدخول
                                </Link>{" "}
                                لمزامنته مع حسابك
                              </p>
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {!authPending && !loggedIn && tab === "device" && device !== null && device.length > 0 && (
              <p className="mt-8 text-center text-xs" style={{ color: "var(--ink-muted)" }}>
                <Link href="/auth/login?callback=/saved" className="underline" style={{ color: "var(--accent-strong)" }}>
                  سجّل الدخول بحساب Google
                </Link>{" "}
                لتحصل على مكتبة متزامنة ترافقك أينما قرأت.
              </p>
            )}
          </section>
        )}
      </main>
    </>
  );
}
