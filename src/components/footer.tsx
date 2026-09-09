"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/sections";
import { SOCIAL_KEYS, SOCIAL_LABELS, SOCIAL_LINKS, type SocialKey } from "@/lib/constants/socials";

/*
 * التذييل مكون آمن يعمل في كل الصفحات (Server وClient على حد سواء).
 * القاعدة الذهبية: لا يجوز أن يكون أي مكوّن مستورد داخل صفحة "use client"
 * من نوع async — React 19 يرمي الخطأ #482 فورًا عندئذٍ.
 * لذلك: النص الافتراضي يُرسم فورًا (ثابت بين السيرفر والعميل = لا مشاكل
 * hydration)، ثم يُستبدل بعد التحميل بنص التذييل المُدار من لوحة التحكم.
 */
const DEFAULT_FOOTER_TEXT = "نُشر بعناية.. لكلام له لازمة.";
const DEFAULT_COPYRIGHT = "© كلام له لازمة — جميع الحقوق محفوظة";

/* الروابط الرسمية المعتمدة — مصدر الحقيقة الموحد lib/constants/socials.ts،
   ويُدمج فوقها تجاوز الأدمن اللحظي من التكوين السيادي (social.*) */
type SocialEntry = { key: SocialKey; label: string; url: string; icon: React.ReactNode };

const SOCIAL_ICONS: Record<SocialKey, React.ReactNode> = {
  facebook: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.3-.04-1.27-.13-2.4-.13-2.4 0-4 1.45-4 4.1v2.35H7.6V13h2.7v8h3.2Z" /></svg>,
  whatsapp: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a9.9 9.9 0 0 0-8.5 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.9l-.5-.3-3 .8.8-2.9-.3-.5A8 8 0 0 1 12 4Zm-3 4.2c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.2.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.5-.3l-1.8-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6L9.7 8.6c-.2-.4-.4-.4-.6-.4H9Z" /></svg>,
  telegram: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.6 18.9 19c-.2 1-.8 1.2-1.7.75l-4.6-3.4-2.2 2.1c-.25.25-.45.45-.9.45l.3-4.6L18.1 6.6c.35-.3-.1-.5-.55-.2L7.7 12.9l-4.4-1.4c-1-.3-1-.95.2-1.4l17.1-6.6c.8-.3 1.5.2 1.3 1.1Z" /></svg>,
  email: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>,
  youtube: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.4-.45-4.9a2.5 2.5 0 0 0-1.75-1.75C19.25 4.9 12 4.9 12 4.9s-7.25 0-8.8.45A2.5 2.5 0 0 0 1.45 7.1C1 8.6 1 12 1 12s0 3.4.45 4.9a2.5 2.5 0 0 0 1.75 1.75c1.55.45 8.8.45 8.8.45s7.25 0 8.8-.45a2.5 2.5 0 0 0 1.75-1.75C23 15.4 23 12 23 12ZM9.75 15.5v-7l6 3.5-6 3.5Z" /></svg>,
  instagram: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2.5" y="2.5" width="19" height="19" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" /></svg>,
  threads: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.2 22.5h-.05c-3.3-.02-5.85-1.1-7.6-3.23C3 17.4 2.15 14.9 2.1 11.9v-.02C2.15 8.87 3 6.37 4.65 4.5 6.4 2.4 8.95 1.3 12.15 1.3c2.95 0 5.35.92 7.1 2.75 1.5 1.55 2.35 3.6 2.6 6.15l.02.2-1.55.55-.05-.25c-.35-2.8-1.65-5.05-5.15-5.55-1.9-.28-4 .2-5.35 1.75-1.05 1.2-1.6 3-1.6 5.35 0 2.6.65 4.55 1.95 5.8 1.1 1.1 2.6 1.6 4.15 1.5 2.3-.15 3.9-1.35 4.5-3.35a4.6 4.6 0 0 0 .2-2c-.1-.7-.35-1.3-.75-1.8-.7-.85-1.75-1.35-2.95-1.5a5.2 5.2 0 0 0-2.15.2c-.95.3-1.7.95-2.05 1.85-.2.5-.3 1.05-.25 1.6.2 1.4 1.25 2.35 2.7 2.55.95.15 1.8 0 2.35-.4.5-.35.8-.85.85-1.4.05-.5-.1-1-.45-1.4-.4-.5-1-.8-1.75-.95-.4-.05-.75-.05-1.1 0l-.4-1.45c.55-.15 1.15-.15 1.8-.05 1.15.2 2.1.7 2.75 1.5.6.7.85 1.6.75 2.55a3.7 3.7 0 0 1-1.6 2.6c-.9.65-2.2.9-3.6.7-2.2-.3-3.75-1.7-4.05-3.7-.2-1.2.1-2.4.85-3.4a5.2 5.2 0 0 1 3.25-2.05 7.3 7.3 0 0 1 3.1.15c1.65.4 3 1.25 3.9 2.5.65.9 1.05 2 1.2 3.1.1.9 0 1.85-.3 2.8-.85 2.7-3.1 4.35-6.1 4.55-.2.03-.4.03-.6.03Zm.05-6.55c.4 0 .8.05 1.2.1.9.15 1.65.5 2.15 1.1.6.7.85 1.5.8 2.35-.05.9-.5 1.65-1.25 2.2a4.7 4.7 0 0 1-.1.05c-.65.4-1.45.6-2.35.6-.25 0-.5-.02-.75-.05-1.95-.3-3.35-1.6-3.6-3.6-.05-.6 0-1.2.2-1.75.15-.35.35-.65.6-.95.75.05 1.45.1 2.1.15.35.05.7.05 1 0Z" /></svg>,
  x: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3.2l-7.1 8.1L21.9 21h-6.5l-5.1-6.6L4.5 21H1.3l7.6-8.7L1.7 3h6.7l4.6 6L17.5 3Zm-1.1 16h1.8L7.4 4.9H5.5L16.4 19Z" /></svg>,
  tiktok: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.3 7.3a5.6 5.6 0 0 1-3.4-3.9A5.7 5.7 0 0 1 15.7 2h-3.4v13.4a2.85 2.85 0 1 1-2-2.7V9.2a6.2 6.2 0 1 0 5.4 6.15V9.5a9 9 0 0 0 4.6 1.3V7.45c-.35 0-.7-.05-1-.15Z" /></svg>,
  snapchat: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c2.9 0 5.2 2.3 5.3 5.2l.05 1.5c.4.15.8.05 1.3-.15.5-.2 1.2.1 1.35.65.15.55-.2 1-.75 1.25-.7.35-1.5.6-1.6 1.1-.05.25.1.6.35 1.05.6 1.05 1.65 2.35 3.2 2.85.4.15.6.55.5.95-.15.5-.7.8-1.6.95-.5.1-.8.2-.95.5-.1.2-.1.45-.15.7-.05.4-.35.6-.8.55-.6-.1-1.3-.2-2.1.15-.65.3-1.15.85-1.75 1.3-.75.55-1.55.9-2.35.9s-1.6-.35-2.35-.9c-.6-.45-1.1-1-1.75-1.3-.8-.35-1.5-.25-2.1-.15-.45.05-.75-.15-.8-.55-.05-.25-.05-.5-.15-.7-.15-.3-.45-.4-.95-.5-.9-.15-1.45-.45-1.6-.95-.1-.4.1-.8.5-.95 1.55-.5 2.6-1.8 3.2-2.85.25-.45.4-.8.35-1.05-.1-.5-.9-.75-1.6-1.1-.55-.25-.9-.7-.75-1.25.15-.55.85-.85 1.35-.65.5.2.9.3 1.3.15L6.7 7.2C6.8 4.3 9.1 2 12 2Z" /></svg>,
  devto: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7.4 9.6 5.9 14.3c1-.1 1.9-.6 2.5-1.4.5-.7.6-1.6.4-2.4-.1-.5-.6-.9-1.4-.9ZM2 2h20a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm4.3 5.2c-1.6 0-3 1-3.3 2.6l-.7 4.3c-.3 1.8.9 3.6 3 3.6h1.9c2 0 3.6-1.2 3.9-3 .2-1-.1-2-.8-2.7.5-.5.8-1.2.9-1.9.3-1.6-.9-2.9-2.9-2.9H6.3Zm9.6 1.4h5.2v1.6h-3.6v1.5h3v1.6h-3v1.5h3.6V16h-5.2a.9.9 0 0 1-.9-.9V9.5c0-.5.4-.9.9-.9Zm1.7 12.5h-1.2l.5-1.2h1.4l-.7 1.2Z" /></svg>,
  portfolio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.5 2.6 3.8 5.9 3.8 9.5S14.5 18.9 12 21.5c-2.5-2.6-3.8-5.9-3.8-9.5S9.5 5.1 12 2.5Z" /></svg>,
  github: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.7.1-.7 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.7 5.1.4.3.7.9.7 1.9V21.5c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z" /></svg>,
  linkedin: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05A4.18 4.18 0 0 1 17.5 8.7c4 0 4.5 2.6 4.5 6V21h-4v-5.6c0-1.3 0-3-1.85-3s-2.15 1.4-2.15 2.9V21h-4V9Z" /></svg>,
};

const DEFAULT_SOCIALS: SocialEntry[] = SOCIAL_KEYS.map((key) => ({
  key,
  label: SOCIAL_LABELS[key],
  url: SOCIAL_LINKS[key],
  icon: SOCIAL_ICONS[key],
}));

export function Footer() {
  const [footerText, setFooterText] = useState(DEFAULT_FOOTER_TEXT);
  /* التكوين السيادي: نص حقوق النشر والروابط الرسمية — يحكمهما الأدمن لحظيًا */
  const [copyright, setCopyright] = useState(DEFAULT_COPYRIGHT);
  const [socials, setSocials] = useState<SocialEntry[]>(DEFAULT_SOCIALS);
  /* الأقسام الحية — الثابتة مرسومة فورًا (بلا مشاكل hydration)،
     وتُستبدل بعد التحميل بالأقسام الفعلية من قاعدة البيانات: ما يظهر
     في التذييل يطابق دائمًا ما يعتمده الأدمن في لوحة التحكم */
  const [sections, setSections] = useState<{ slug: string; name: string }[]>(SECTIONS);

  /* جلب نص التذييل المُدار من لوحة التحكم — بعد الرسم الأول حتى لا نكسر الترطيب */
  useEffect(() => {
    let alive = true;
    fetch("/api/public-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.FOOTER_TEXT) setFooterText(d.FOOTER_TEXT);
        if (alive && d?.COPYRIGHT_TEXT) setCopyright(d.COPYRIGHT_TEXT);
        if (alive && Array.isArray(d?.LIVE_SECTIONS) && d.LIVE_SECTIONS.length > 0) {
          /* الأقسام الحية من قاعدة البيانات — مصدر الحقيقة الواحد للتذييل */
          const live = (d.LIVE_SECTIONS as { slug: string; name: string }[]).filter(
            (s) => s.slug && s.name,
          );
          if (live.length > 0) setSections(live);
        }
        if (alive && Array.isArray(d?.SOCIAL_LINKS) && d.SOCIAL_LINKS.length > 0) {
          /* الروابط الرسمية الموحدة من التكوين السيادي — social.* فوق الافتراضيات،
             والمفاتيح المعروفة تأخذ أيقونتها، والجديدة بأيقونة عامة (◈) */
          const bundle = d.SOCIAL_LINKS as { key?: string; label?: string; url?: string }[];
          const mapped = bundle
            .filter((e) => e.url && (e.key || e.label))
            .map((e) => {
              const key =
                e.key && Object.prototype.hasOwnProperty.call(SOCIAL_ICONS, e.key)
                  ? (e.key as SocialKey)
                  : null;
              return {
                key: (key ?? (e.key as SocialKey) ?? "facebook") as SocialKey,
                label: e.label ?? (key ? SOCIAL_LABELS[key] : "رابط"),
                url: e.url!,
                icon: key ? SOCIAL_ICONS[key] : (<span className="text-sm leading-none">◈</span> as React.ReactNode),
              };
            });
          if (mapped.length > 0) setSocials(mapped);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <footer className="site-footer mt-auto border-t" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <p className="font-ui text-xl font-bold" style={{ color: "var(--ink)" }}>
              كلام له لازمة
            </p>
            <p className="mt-2 max-w-sm text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
              مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.
              <br />
              منصة فكرية نقية: بلا ضجيج، بلا إعلانات، بلا حشو.
            </p>
            {/* منصات صاحب المنصة */}
            <div className="mt-5 flex flex-wrap gap-2">
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              الأقسام
            </p>
            <ul className="space-y-2.5 text-sm">
              {sections.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/section/${s.slug}`}
                    className="transition-colors hover:text-[var(--accent)]"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              المنصة والسياسات
            </p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/about" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  فلسفتنا ومعايير النشر
                </Link>
              </li>
              <li>
                <Link href="/saved" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  قراءاتي المحفوظة
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  اتصل بنا
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  سياسة الخصوصية
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  شروط الاستخدام
                </Link>
              </li>
              <li>
                <Link href="/dialogue-ethics" className="transition-colors hover:text-[var(--accent)]" style={{ color: "var(--ink-muted)" }}>
                  أخلاقيات الحوار والتعليق
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-10 border-t pt-6 text-center text-xs leading-6"
          style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
        >
          {footerText}
          <br />
          {copyright}
        </div>
      </div>
    </footer>
  );
}
