import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "اتصل بنا",
  description:
    "راسل إدارة منصة كلام له لازمة مباشرة — اقتراحات، ملاحظات، أو كلمة طيبة. رسالتك تصل للإدارة مباشرة.",
};

const CHANNELS = [
  { label: "البريد الإلكتروني", value: "ziad90216@gmail.com", href: "mailto:ziad90216@gmail.com" },
  { label: "تليجرام", value: "t.me/ziadamr", href: "https://t.me/ziadamr" },
  { label: "فيسبوك", value: "facebook.com/ziad7mr", href: "https://www.facebook.com/ziad7mr" },
  { label: "إكس (تويتر)", value: "x.com/ziad90216", href: "https://x.com/ziad90216" },
];

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
          <header className="page-chrome text-center">
            <h1 className="font-body text-3xl font-bold leading-[1.8] sm:text-4xl" style={{ color: "var(--ink)" }}>
              اتصل بنا
            </h1>
            <div className="mx-auto mt-6 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
            <p className="mx-auto mt-5 max-w-xl text-sm leading-8" style={{ color: "var(--ink-muted)" }}>
              اقتراح.. ملاحظة.. طلب حذف بيانات.. أو كلمة طيبة — كل الرسائل تصل
              مباشرة إلى لوحة تحكم صاحب المنصة ويُطّلع عليها شخصيًا.
            </p>
          </header>

          <div className="page-chrome mt-10">
            <ContactForm />
          </div>

          {/* قنوات التواصل المباشر */}
          <div className="page-chrome mt-10 rounded-3xl border p-6" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <h2 className="font-ui mb-4 text-base font-bold" style={{ color: "var(--ink)" }}>
              أو تواصل مباشرة عبر
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((c) => (
                <a
                  key={c.label}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--ink)" }}>
                    {c.label}
                  </span>
                  <span dir="ltr" className="text-xs" style={{ color: "var(--accent-strong)" }}>
                    {c.value}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
