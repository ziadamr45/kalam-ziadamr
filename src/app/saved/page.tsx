"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getOfflineArticles, removeOfflineArticle } from "@/lib/indexeddb";
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

function SaveCard({
  title,
  summary,
  meta,
  href,
  onRemove,
  removeLabel,
}: {
  title: string;
  summary: string;
  meta: string;
  href: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <li className="rounded-2xl border p-6 shadow-soft" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={href} className="font-body text-lg font-bold leading-8 hover:underline" style={{ color: "var(--ink)" }}>
            {title}
          </Link>
          <p className="mt-2 line-clamp-2 text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
            {summary}
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
            {meta}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "#b4443c" }}
        >
          {removeLabel}
        </button>
      </div>
    </li>
  );
}

export default function SavedPage() {
  const { status } = useSession();
  const loggedIn = status === "authenticated";

  const [saves, setSaves] = useState<AccountSave[] | null>(null);
  const [device, setDevice] = useState<OfflineArticle[] | null>(null);

  /* محفوظات الحساب من قاعدة البيانات */
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/saves")
      .then((r) => (r.ok ? r.json() : { saves: [] }))
      .then((d) => setSaves(d.saves ?? []))
      .catch(() => setSaves([]));
  }, [status]);

  /* محفوظات الجهاز (لقطة دون اتصال) */
  useEffect(() => {
    getOfflineArticles()
      .then(setDevice)
      .catch(() => setDevice([]));
  }, []);

  const removeAccount = async (id: string) => {
    setSaves((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    await fetch("/api/saves", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: id }),
    }).catch(() => {});
  };

  const removeDevice = async (id: string) => {
    /* إزالة من الجهاز ومن الحساب معًا إن وُجد */
    await removeOfflineArticle(id);
    if (loggedIn) {
      await fetch("/api/saves", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: id }),
      }).catch(() => {});
      setSaves((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    }
    setDevice((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  };

  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-32 pb-8 text-center sm:px-6">
          <h1 className="font-body text-3xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            قراءاتي المحفوظة
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-muted)" }}>
            {loggedIn
              ? "محفوظات حسابك تتزامن عبر كل أجهزتك — ولقطة كل مقال محفوظة داخل جهازك للقراءة دون اتصال"
              : "محفوظة داخل جهازك — سجّل الدخول لتتزامن عبر كل أجهزتك"}
          </p>
        </section>

        <section className="mx-auto max-w-3xl space-y-10 px-4 pb-24 sm:px-6">
          {/* ================== محفوظات الحساب المتزامنة ================== */}
          {loggedIn && (
            <div>
              <h2 className="mb-4 flex items-center gap-2 font-ui text-sm font-bold" style={{ color: "var(--accent-strong)" }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
                مكتبة حسابي — متزامنة عبر الأجهزة
              </h2>
              {saves === null ? (
                <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  جارٍ التحميل..
                </p>
              ) : saves.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                  لا شيء في مكتبة حسابك بعد — اضغط «حفظ في مكتبتي» أعلى أي مقال.
                </div>
              ) : (
                <ul className="space-y-4">
                  {saves.map((s) => (
                    <SaveCard
                      key={s.id}
                      title={s.title}
                      summary={s.summary}
                      meta={`حُفظ في ${formatArabicDate(new Date(s.savedAt))}${s.sectionName ? ` · ${s.sectionName}` : ""} · ${formatReadingTime(s.readingTimeSec)}`}
                      href={`/article/${s.slug}`}
                      onRemove={() => removeAccount(s.id)}
                      removeLabel="إزالة"
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ================== محفوظات الجهاز (دون اتصال) ================== */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 font-ui text-sm font-bold" style={{ color: "var(--ink)" }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--ink-muted)" }} aria-hidden />
              {loggedIn ? "لقطات هذا الجهاز — متاحة دون إنترنت" : "محفوظات هذا الجهاز"}
            </h2>
            {device === null ? (
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                جارٍ التحميل..
              </p>
            ) : device.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
                <p className="font-body text-base leading-8">
                  لم تُحفظ لقطات على هذا الجهاز بعد..
                  <br />
                  اضغط «حفظ في مكتبتي» أعلى أي مقال يلهث قلبك.
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {device.map((a) => (
                  <SaveCard
                    key={a.id}
                    title={a.title}
                    summary={a.summary}
                    meta={`متاحة دون إنترنت · ${formatReadingTime(a.readingTimeSec)}`}
                    href={`/article/${a.slug}`}
                    onRemove={() => removeDevice(a.id)}
                    removeLabel="إزالة"
                  />
                ))}
              </ul>
            )}
          </div>

          {!loggedIn && (
            <p className="text-center text-xs" style={{ color: "var(--ink-muted)" }}>
              <Link href="/login?callback=/saved" className="underline" style={{ color: "var(--accent-strong)" }}>
                سجّل الدخول بحساب Google
              </Link>{" "}
              لتحصل على مكتبة متزامنة تلاحظك أينما قرأت.
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
