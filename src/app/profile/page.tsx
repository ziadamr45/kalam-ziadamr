import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountDangerZone } from "@/components/account-danger-zone";
import { ProfileEditor } from "@/components/profile-editor";
import { ProposalForm } from "@/components/proposal-form";
import { RankBadge } from "@/components/rank-badge";
import { displayName } from "@/lib/identity";
import { RANKS, rankMeta, canSendProposals } from "@/lib/ranks";
import { formatArabicDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ملفي الشخصي — كلام له لازمة",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/* أسماء أفعال الأثر بالعربية */
const ACTION_LABEL: Record<string, string> = {
  READ_COMPLETE: "قراءة متأنية أتممتها",
  AI_DISCUSS: "نقاش فكري عميق مع المساعد",
  COMMENT_APPROVED: "تعليق هادف اجتاز الفلترة",
  COMMENT_INSPIRING: "تمييز التحرير لتعليقك كـ«ملهم»",
  QUOTE_SHARE: "حفظ ومشاركة اقتباس",
  ADMIN_ADJUST: "تعديل إداري من صاحب المنصة",
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  PENDING: { text: "بانتظار المراجعة", color: "#b58a2c" },
  APPROVED: { text: "منشور", color: "#3c7a4e" },
  REJECTED: { text: "مرفوض", color: "#b4443c" },
};

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?callback=/profile");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      customName: true,
      customImage: true,
      bio: true,
      impactScore: true,
      intellectualRank: true,
      createdAt: true,
      _count: { select: { comments: true, savedArticles: true, interactions: true } },
    },
  });

  if (!user) redirect("/auth/login?callback=/profile");

  const [logs, comments] = await Promise.all([
    prisma.impactLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        actionType: true,
        points: true,
        reason: true,
        createdAt: true,
        article: { select: { slug: true, title: true } },
      },
    }),
    prisma.comment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
        article: { select: { slug: true, title: true } },
      },
    }),
  ]);

  const approvedCount = comments.filter((c) => c.status === "APPROVED").length;

  /* شريط التقدم نحو الرتبة التالية */
  const meta = rankMeta(user.intellectualRank);
  const idx = RANKS.findIndex((r) => r.key === meta.key);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  const prevMin = meta.min;
  const progress = next
    ? Math.min(100, Math.round(((user.impactScore - prevMin) / (next.min - prevMin)) * 100))
    : 100;

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* ==================== بطاقة الهوية ==================== */}
        <section className="mx-auto max-w-3xl px-4 pt-32 sm:px-6">
          <div
            className="flex flex-col items-center gap-6 rounded-3xl border p-8 shadow-lift sm:flex-row sm:text-right"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {user.customImage || user.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={user.customImage || (user.image as string)}
                    alt={displayName(user)}
                    referrerPolicy="no-referrer"
                    className="h-22 w-22 rounded-full border-4 object-cover"
                    style={{ borderColor: "var(--accent-soft)" }}
                  />
                ) : (
                  <span
                    className="flex h-22 w-22 items-center justify-center rounded-full border-4 text-3xl font-bold"
                    style={{ borderColor: "var(--accent-soft)", background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                  >
                    {displayName(user).charAt(0)}
                  </span>
                )}
              </div>
              <RankBadge rank={user.intellectualRank} size="md" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="font-body text-2xl font-bold" style={{ color: "var(--ink)" }}>
                {displayName(user)}
              </h1>
              <p className="mt-1 truncate text-sm" dir="ltr" style={{ color: "var(--ink-muted)" }}>
                {user.email}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                قارئ معنا منذ {formatArabicDate(user.createdAt)} · رصيد أثرك{" "}
                <strong style={{ color: "var(--accent-strong)" }}>
                  {new Intl.NumberFormat("ar-EG").format(user.impactScore)}
                </strong>
              </p>
              {user.bio && (
                <p className="font-body mt-3 text-sm leading-7" style={{ color: "var(--ink)" }}>
                  {user.bio}
                </p>
              )}
            </div>

            <SignOutButton />
          </div>
        </section>

        {/* ==================== شريط الرحلة نحو الرتبة التالية ==================== */}
        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <div
            className="rounded-2xl border p-5 shadow-soft"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                رحلتك الفكرية: {meta.key}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                {next
                  ? `${new Intl.NumberFormat("ar-EG").format(Math.max(0, next.min - user.impactScore))} نقطة تفصلك عن «${next.key}»`
                  : "أعلى رتبة فكرية — أنت من أهل الكلمة"}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(4, progress)}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {RANKS.map((r) => (
                <span
                  key={r.key}
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                  style={
                    r.key === meta.key
                      ? { background: r.soft, color: r.color }
                      : { background: "var(--bg-soft)", color: "var(--ink-muted)" }
                  }
                >
                  {r.key} · {new Intl.NumberFormat("ar-EG").format(r.min)}+
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-6" style={{ color: "var(--ink-muted)" }}>
              {meta.hint}. تُكتسب النقاط بالقراءة المتأنية (+10)، والنقاش العميق (+5)،
              والتعليق الهادف (+15)، والاقتباس المشارَك (+3)، وتمييز التحرير لتعليقك (+30).
            </p>
          </div>
        </section>

        {/* ==================== إعدادات الهوية ==================== */}
        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <ProfileEditor
            googleName={user.name}
            googleImage={user.image}
            initial={{
              customName: user.customName,
              customImage: user.customImage,
              bio: user.bio,
            }}
          />
        </section>

        {/* ==================== سجل الأثر ==================== */}
        {logs.length > 0 && (
          <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
            <h2 className="mb-4 font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
              سجل أثرك الأخير
            </h2>
            <ul className="space-y-2.5">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-soft"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {ACTION_LABEL[l.actionType] ?? l.actionType}
                      {l.reason ? ` — ${l.reason}` : ""}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      {l.article?.slug ? (
                        <Link href={`/article/${l.article.slug}`} prefetch={true} className="hover:underline">
                          {l.article.title}
                        </Link>
                      ) : (
                        formatArabicDate(l.createdAt)
                      )}
                      {l.article?.slug ? ` · ${formatArabicDate(l.createdAt)}` : ""}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{
                      background: l.points >= 0 ? meta.soft : "rgba(180,68,60,0.12)",
                      color: l.points >= 0 ? "var(--accent-strong)" : "#b4443c",
                    }}
                  >
                    {l.points >= 0 ? "+" : ""}
                    {new Intl.NumberFormat("ar-EG").format(l.points)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ==================== قناة «أهل الكلمة» ==================== */}
        {canSendProposals(user.intellectualRank) && (
          <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
            <ProposalForm />
          </section>
        )}

        {/* ==================== إحصاءات القارئ ==================== */}
        <section className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-3 px-4 sm:px-6">
          {[
            { label: "تعليقاتي", value: user._count.comments },
            { label: "محفوظاتي", value: user._count.savedArticles },
            { label: "تفاعلاتي", value: user._count.interactions },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border p-4 text-center shadow-soft"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <p className="font-body text-2xl font-bold" style={{ color: "var(--accent-strong)" }}>
                {new Intl.NumberFormat("ar-EG").format(s.value)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {/* ==================== تعليقاتي ==================== */}
        <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
          <h2 className="mb-4 font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
            تعليقاتي
          </h2>

          {comments.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
              <p className="font-body text-base leading-8">
                لم تشارك في الحوار بعد..
                <br />
                رأيك فيه لازمة — عبّر بأدب.
              </p>
              <a
                href="/"
                className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-bold transition-all hover:scale-105"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                تصفّح المقالات
              </a>
            </div>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => {
                const badge = STATUS_LABEL[c.status] ?? STATUS_LABEL.PENDING;
                return (
                  <li
                    key={c.id}
                    className="rounded-2xl border p-5 shadow-soft"
                    style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {c.article?.slug ? (
                        <Link
                          href={`/article/${c.article.slug}`}
                          prefetch={true}
                          className="text-xs font-bold hover:underline"
                          style={{ color: "var(--accent-strong)" }}
                        >
                          {c.article.title}
                        </Link>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                          مقال محذوف
                        </span>
                      )}
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{ background: "var(--accent-soft)", color: badge.color }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7" style={{ color: "var(--ink)" }}>
                      {c.content}
                    </p>
                    <p className="mt-2 text-[10px]" style={{ color: "var(--ink-muted)" }}>
                      {formatArabicDate(c.createdAt)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-6 text-center text-[11px]" style={{ color: "var(--ink-muted)" }}>
            كل تعليق يمرّ بفلترة أخلاقية من ثلاث مستويات — {approvedCount > 0 ? `و${approvedCount} من تعليقاتك هنا منشورة` : "المراجعة تحمي مساحة الحوار للجميع"}.
          </p>
        </section>

        {/* منطقة حذف الحساب — وعد سياسة الخصوصية مُطبّق حرفيًا */}
        <section className="mx-auto mt-4 max-w-3xl px-4 pb-24 sm:px-6">
          <AccountDangerZone />
        </section>
      </main>
      <Footer />
    </>
  );
}
