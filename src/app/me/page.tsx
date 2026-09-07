import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SignOutButton } from "@/components/sign-out-button";
import { AvatarUploader } from "@/components/avatar-uploader";
import { AccountDangerZone } from "@/components/account-danger-zone";
import { formatArabicDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "حسابي — كلام له لازمة",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  PENDING: { text: "بانتظار المراجعة", color: "#b58a2c" },
  APPROVED: { text: "منشور", color: "#3c7a4e" },
  REJECTED: { text: "مرفوض", color: "#b4443c" },
};

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callback=/me");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      createdAt: true,
      _count: { select: { comments: true, savedArticles: true, interactions: true } },
    },
  });

  if (!user) redirect("/login?callback=/me");

  const comments = await prisma.comment.findMany({
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
  });

  const approvedCount = comments.filter((c) => c.status === "APPROVED").length;

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* ==================== بطاقة الحساب ==================== */}
        <section className="mx-auto max-w-3xl px-4 pt-32 sm:px-6">
          <div
            className="flex flex-col items-center gap-6 rounded-3xl border p-8 shadow-lift sm:flex-row sm:text-right"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            {/* محرر الحساب: رفع صورة سحابي بمعاينة لحظية (Cloudinary) */}
            <AvatarUploader currentImage={user.image} />

            <div className="min-w-0 flex-1">
              <h1 className="font-body text-2xl font-bold" style={{ color: "var(--ink)" }}>
                {user.name || "قارئ كلام له لازمة"}
              </h1>
              <p className="mt-1 truncate text-sm" dir="ltr" style={{ color: "var(--ink-muted)" }}>
                {user.email}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                قارئ معنا منذ {formatArabicDate(user.createdAt)}
              </p>
            </div>

            <SignOutButton />
          </div>
        </section>

        {/* ==================== إحصاءات القارئ ==================== */}
        <section className="mx-auto mt-6 grid max-w-3xl grid-cols-3 gap-3 px-4 sm:px-6">
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
                {s.value}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {/* ==================== تعليقاتي ==================== */}
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
              <Link
                href="/"
                className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-bold transition-all hover:scale-105"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                تصفّح المقالات
              </Link>
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
