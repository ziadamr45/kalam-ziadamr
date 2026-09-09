"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatArabicDate } from "@/lib/utils";

/* أسماء أفعال الأثر بالعربية — تُشارك بين القائمة المختصرة والنافذة الكاملة */
export const IMPACT_ACTION_LABEL: Record<string, string> = {
  READ_COMPLETE: "قراءة متأنية أتممتها",
  AI_DISCUSS: "نقاش فكري عميق مع المساعد",
  COMMENT_APPROVED: "تعليق هادف اجتاز الفلترة",
  COMMENT_LIKED: "إعجاب قارئ مسجل بتعليقك",
  COMMENT_INSPIRING: "تمييز التحرير لتعليقك كـ«ملهم»",
  COMMENT_UNFEATURED: "إلغاء التمييز الإداري (خصم)",
  QUOTE_SHARE: "حفظ ومشاركة اقتباس",
  CHANNEL_UNLOCKED: "افتتاح قناة «أهل الكلمة»",
  CALIBRATION: "معايرة اقتصاد النقاط",
  ADMIN_ADJUST: "تعديل إداري من صاحب المنصة",
};

type LogRow = {
  id: string;
  actionType: string;
  points: number;
  reason: string | null;
  createdAt: string;
  article: { slug: string; title: string } | null;
};

/**
 * زر فتح نافذة «سجل الأثر» — يُزرع في صفحة الملف الشخصي بجوار القائمة المختصرة
 */
export function ImpactLogButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full px-4 py-2 text-xs font-bold transition-all hover:scale-105 ${className}`}
        style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
      >
        سجل الأثر الكامل
      </button>
      <ImpactLogModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * نافذة «سجل الأثر» — جدول تدقيق تفصيلي بكل عملية رصيد:
 * (الحدث، التاريخ، وعدد النقاط المكتسبة أو المخصومة) بترقيم صفحات كامل.
 * الشفافية مبدأ: كل نقطة في الرصيد لها سطر موثق هنا.
 */
export function ImpactLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/impact/logs?page=${p}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      setScore(data.impactScore ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPage(1);
      load(1);
    }
  }, [open, load]);

  /* قفل تمرير الصفحة خلف النافذة + إغلاق بزر Escape */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="سجل الأثر الكامل">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-lift animate-fade-in sm:rounded-3xl"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* رأس النافذة */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
              سجل الأثر
            </h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-muted)" }}>
              كل نقطة في رصيدك موثقة هنا — {total > 0 ? `${total} عملية` : "لا عمليات بعد"}
              {typeof score === "number" ? ` · رصيدك الحالي ${new Intl.NumberFormat("ar-EG").format(score)} نقطة` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق السجل"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-[var(--accent-soft)]"
            style={{ color: "var(--ink-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* جدول التدقيق — (الحدث، التاريخ، النقاط) */}
        <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-4">
          {loading ? (
            <p className="py-14 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              جارٍ تحميل السجل..
            </p>
          ) : logs.length === 0 ? (
            <p className="py-14 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
              لا عمليات بعد — اقرأ مقالًا بتأنٍّ أو شارك تعليقًا هادفًا وابدأ بناء أثرك
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  <th className="px-3 py-2.5 text-right font-bold">الحدث</th>
                  <th className="px-3 py-2.5 text-right font-bold">التاريخ</th>
                  <th className="px-3 py-2.5 text-center font-bold">النقاط</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-3">
                      <p className="font-semibold leading-6" style={{ color: "var(--ink)" }}>
                        {IMPACT_ACTION_LABEL[l.actionType] ?? l.actionType}
                      </p>
                      {(l.reason || l.article) && (
                        <p className="mt-0.5 text-[11px] leading-5" style={{ color: "var(--ink-muted)" }}>
                          {l.article?.slug ? (
                            <Link href={`/article/${l.article.slug}`} prefetch={false} className="hover:underline">
                              «{l.article.title}»
                            </Link>
                          ) : null}
                          {l.article?.slug && l.reason ? " — " : ""}
                          {l.reason}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      {formatArabicDate(l.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{
                          background: l.points >= 0 ? "var(--accent-soft)" : "rgba(180,68,60,0.12)",
                          color: l.points >= 0 ? "var(--accent-strong)" : "#b4443c",
                        }}
                      >
                        {l.points >= 0 ? "+" : ""}
                        {new Intl.NumberFormat("ar-EG").format(l.points)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ترقيم الصفحات */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => {
                const p = Math.max(1, page - 1);
                setPage(p);
                load(p);
              }}
              disabled={page <= 1 || loading}
              className="rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              الأحدث
            </button>
            <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
              صفحة {page} من {pages}
            </span>
            <button
              onClick={() => {
                const p = Math.min(pages, page + 1);
                setPage(p);
                load(p);
              }}
              disabled={page >= pages || loading}
              className="rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-40"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              الأقدم
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
