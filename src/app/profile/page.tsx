import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountDangerZone } from "@/components/account-danger-zone";
import { ProfileEditor } from "@/components/profile-editor";
import { DevicesPanel } from "@/components/devices-panel";
import { ReadingPreferencesCard } from "@/components/reading-preferences-card";
import { PrivacyToolsCard } from "@/components/privacy-tools-card";
import { FirstVisitHint } from "@/components/first-visit-hint";
import { ProposalForm } from "@/components/proposal-form";
import { RankBadge } from "@/components/rank-badge";
import { parsePrivileges, PRIVILEGE_LABELS, roleLabelAr } from "@/lib/vip";
import { verificationSealColor, verificationSealLabel, parseSocialLinks } from "@/lib/verification-meta";
import PushPromptCapsule from "@/components/push-prompt-capsule";
import { displayName } from "@/lib/identity";
import { IMPACT_ACTION_LABEL, ImpactLogButton } from "@/components/impact-log-modal";
import { RANKS, rankMeta, canSendProposals } from "@/lib/ranks";
import { formatArabicDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ملفي الشخصي — كلام له لازمة",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  PENDING: { text: "بانتظار المراجعة", color: "#b58a2c" },
  APPROVED: { text: "منشور", color: "#3c7a4e" },
  REJECTED: { text: "مرفوض", color: "#b4443c" },
};

const TABS: Array<{ key: string; href: string; label: string }> = [
  { key: "profile", href: "/profile", label: "ملفي وأثري" },
  { key: "settings", href: "/profile?tab=settings", label: "الإعدادات والتفضيلات" },
  { key: "security", href: "/profile?tab=security", label: "الأمان والجلسات" },
];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "settings" || rawTab === "security" ? rawTab : "profile";
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?callback=/profile");
  }

  const [user, logs, comments] = await Promise.all([
    prisma.user.findUnique({
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
        role: true,
        isVerified: true,
        verifiedAt: true,
        verificationType: true,
        verificationLabel: true,
        isVip: true,
        vipBadgeTitle: true,
        vipBadgeColor: true,
        vipReason: true,
        vipGrantedAt: true,
        vipPrivileges: true,
        extendedBio: true,
        verifiedSocialLinks: true,
        notificationPrefs: true,
        _count: { select: { comments: true, savedArticles: true, interactions: true } },
      },
    }),
    tab === "profile"
      ? prisma.impactLog.findMany({
          where: { userId: session.user.id },
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
        })
      : Promise.resolve([]),
    tab === "profile"
      ? prisma.comment.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            content: true,
            status: true,
            createdAt: true,
            article: { select: { slug: true, title: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  if (!user) redirect("/auth/login?callback=/profile");

  const approvedCount = comments.filter((c) => c.status === "APPROVED").length;

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
        <section className="mx-auto max-w-3xl px-4 pt-28 sm:px-6">
          <nav
            data-tour="profile-tabs"
            className="flex gap-1.5 rounded-2xl border p-1.5 shadow-soft"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            aria-label="أقسام الملف الشخصي"
          >
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  prefetch={true}
                  className="flex-1 rounded-xl px-2 py-2.5 text-center text-xs font-bold transition-all"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--ink-muted)",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </section>

        {tab === "profile" && (
          <>
        <FirstVisitHint
          id="profile-main"
          mode="tour"
          steps={[
            {
              selector: "[data-tour='profile-tabs']",
              title: "أقسام حسابك",
              text: "من هنا تتنقل بين ملفك وأثرك، وإعدادات الهوية والإشعارات، والأمان والجلسات.",
            },
            {
              selector: "[data-tour='profile-identity']",
              title: "بطاقتك الفكرية",
              text: "هنا تظهر هويتك ورتبتك الفكرية ورصيد أثرك الإجمالي.",
            },
            {
              selector: "[data-tour='profile-rank']",
              title: "رحلتك نحو أهل الكلمة",
              text: "وهنا تتابع تقدمك للرتبة التالية وكيفية كسب نقاط الأثر.",
            },
          ]}
        />

        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <div
            data-tour="profile-identity"
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
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-body text-2xl font-bold" style={{ color: "var(--ink)" }}>
                  {displayName(user)}
                </h1>
                {user.isVerified && (() => {
                  const sealColor = verificationSealColor(user.verificationType);
                  const sealLabel = verificationSealLabel(user.verificationType, user.verificationLabel);
                  return (
                    <span
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                      style={{
                        background: `${sealColor}1f`,
                        color: sealColor,
                        border: `1px solid ${sealColor}55`,
                      }}
                      title={`حساب موثّق رسميًا — ${sealLabel}${user.verifiedAt ? ` منذ ${formatArabicDate(user.verifiedAt)}` : ""}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 1.5l2.5 2.1 3.2-.4 1.2 3 3 1.2-.4 3.2L23.5 12l-2 2.4.4 3.2-3 1.2-1.2 3-3.2-.4L12 23.5l-2.5-2.1-3.2.4-1.2-3-3-1.2.4-3.2L.5 12l2-2.4-.4-3.2 3-1.2 1.2-3 3.2.4L12 1.5z" />
                        <path d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" fill="#fff" />
                      </svg>
                      {sealLabel}
                    </span>
                  );
                })()}
                {user.isVip && user.vipBadgeTitle && (
                  <span
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                    style={{
                      background: `${user.vipBadgeColor || "#7C3AED"}1f`,
                      color: user.vipBadgeColor || "#7C3AED",
                      border: `1px solid ${user.vipBadgeColor || "#7C3AED"}55`,
                    }}
                    title={user.vipReason ? `عضوية مميزة: ${user.vipReason}` : "عضوية مميزة"}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
                    </svg>
                    {user.vipBadgeTitle}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm" dir="ltr" style={{ color: "var(--ink-muted)" }}>
                {user.email}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                {roleLabelAr(user.role)} · قارئ معنا منذ {formatArabicDate(user.createdAt)} · رصيد أثرك{" "}
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

        {user.isVip && (() => {
          const privs = parsePrivileges(user.vipPrivileges);
          const granted = (Object.keys(PRIVILEGE_LABELS) as (keyof typeof PRIVILEGE_LABELS)[]).filter((k) => privs[k]);
          if (!granted.length && !user.vipReason) return null;
          return (
            <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
              <div
                className="rounded-2xl border p-5 shadow-soft"
                style={{
                  background: `linear-gradient(135deg, ${user.vipBadgeColor || "#D97706"}0d, var(--surface))`,
                  borderColor: `${user.vipBadgeColor || "#D97706"}44`,
                }}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-bold" style={{ color: user.vipBadgeColor || "#D97706" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2l2.6 6.2L21 9l-4.9 4.3L17.5 20 12 16.6 6.5 20l1.4-6.7L3 9l6.4-.8L12 2z" />
                    </svg>
                    مزاياك الفكرية المميزة
                  </p>
                  {user.vipGrantedAt && (
                    <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                      مُنحت في {formatArabicDate(user.vipGrantedAt)}
                    </p>
                  )}
                </div>
                {granted.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {granted.map((k) => (
                      <span
                        key={k}
                        className="rounded-full border px-3 py-1 text-xs font-medium"
                        style={{ borderColor: `${user.vipBadgeColor || "#D97706"}44`, color: "var(--ink)" }}
                      >
                        {PRIVILEGE_LABELS[k]}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-6" style={{ color: "var(--ink-muted)" }}>
                    توثيقك أعلى اسمك في كل النقاشات — واصل بناء أثرك لفتح مزايا أعمق.
                  </p>
                )}
                {user.vipReason && (
                  <p className="mt-3 border-t pt-3 text-xs leading-6" style={{ borderColor: `${user.vipBadgeColor || "#D97706"}22`, color: "var(--ink-muted)" }}>
                    سبب التمييز من الإدارة: {user.vipReason}
                  </p>
                )}
              </div>
            </section>
          );
        })()}

        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <div
            data-tour="profile-rank"
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
                style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }}
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
              {meta.hint}. تُكتسب النقاط بالقراءة المتأنية (+1)، والنقاش العميق مع الذكاء الاصطناعي (+1)،
              والتعليق المعتمد (+2)، وإعجاب قارئ بتعليقك (+1)، وتمييز التحرير لتعليقك (+10).
            </p>
          </div>
        </section>
          </>
        )}

        {tab === "settings" && (
          <>
        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <FirstVisitHint
            id="profile-settings"
            className="mb-4"
            steps={[
              {
                title: "هويتك وإشعاراتك",
                text: "من هنا يمكنك تخصيص اسمك وصورتك ونبذتك، وتحديد الإشعارات التي تصلك.",
              },
              {
                title: "تفضيلات القراءة والخصوصية",
                text: "في الأسفل يمكنك ضبط التشكيل الافتراضي، ومسح سجل البحث، أو إعادة عرض بطاقة الترحيب في أي وقت.",
              },
            ]}
          />
          <ProfileEditor
            googleName={user.name}
            googleImage={user.image}
            initial={{
              customName: user.customName,
              customImage: user.customImage,
              bio: user.bio,
              extendedBio: user.extendedBio,
              verifiedSocialLinks: parseSocialLinks(user.verifiedSocialLinks),
              notificationPrefs: (() => {
                const p = user.notificationPrefs as { pushNewArticles?: boolean; impactAndReplies?: boolean } | null;
                return p
                  ? { pushNewArticles: p.pushNewArticles !== false, impactAndReplies: p.impactAndReplies !== false }
                  : null;
              })(),
            }}
            isVerified={user.isVerified}
          />
        </section>

        <section className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
          <ReadingPreferencesCard />
        </section>

        <section className="mx-auto mt-6 max-w-3xl px-4 pb-24 sm:px-6">
          <PrivacyToolsCard />
        </section>
          </>
        )}

        {tab === "profile" && (
          <>
        {logs.length > 0 && (
          <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-ui text-lg font-bold" style={{ color: "var(--ink)" }}>
                سجل أثرك الأخير
              </h2>
              <ImpactLogButton />
            </div>
            <ul className="space-y-2.5">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-soft"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {IMPACT_ACTION_LABEL[l.actionType] ?? l.actionType}
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

        {canSendProposals(user.intellectualRank) && (
          <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-6">
            <ProposalForm />
          </section>
        )}

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

        <section className="mx-auto mt-10 max-w-3xl px-4 pb-24 sm:px-6">
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
          </>
        )}

        {tab === "security" && (
          <>
        <section
          className="mx-auto mt-6 max-w-3xl rounded-2xl border p-5 shadow-soft sm:p-6"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <DevicesPanel />
        </section>

        <section className="mx-auto mt-4 max-w-3xl px-4 pb-24 sm:px-6">
          <AccountDangerZone />
        </section>
          </>
        )}
      </main>
      <PushPromptCapsule />
      <SiteFooter />
    </>
  );
}
