import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ContactForm } from "@/components/contact-form";
import { getSocialLinks } from "@/lib/site-config";
import type { SocialLinkEntry } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "اتصل بنا",
  description:
    "راسل إدارة منصة كلام له لازمة مباشرة — اقتراحات، ملاحظات، أو كلمة طيبة. رسالتك تصل للإدارة مباشرة.",
};

/* قنوات المراسلة السريعة المعتمدة — واتساب وتليجرام والبريد أزرار مباشرة */
const QUICK_CHANNELS: Array<"whatsapp" | "telegram" | "email"> = ["whatsapp", "telegram", "email"];
const SECONDARY_CHANNELS: Array<"facebook" | "x" | "instagram" | "youtube"> = [
  "facebook",
  "x",
  "instagram",
  "youtube",
];

export default async function ContactPage() {
  const socials = await getSocialLinks();
  const byKey = (k: string) => socials.find((s) => s.key === k);
  const quick: SocialLinkEntry[] = QUICK_CHANNELS.map(byKey).filter(Boolean) as SocialLinkEntry[];
  const secondary: SocialLinkEntry[] = SECONDARY_CHANNELS.map(byKey).filter(
    Boolean,
  ) as SocialLinkEntry[];

  return (
    <>
      <SiteHeader />
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

          {/* المراسلة السريعة — أزرار مباشرة لأسرع قنوات الوصول */}
          <div className="page-chrome mt-10 rounded-3xl border p-6" style={{ background: "var(--bg-soft)", borderColor: "var(--border)" }}>
            <h2 className="font-ui mb-4 text-base font-bold" style={{ color: "var(--ink)" }}>
              أو تواصل مباشرة عبر
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {quick.map((c) => (
                <a
                  key={c.key}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
                >
                  <span>{c.label}</span>
                  <span aria-hidden>↗</span>
                </a>
              ))}
            </div>
            {secondary.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {secondary.map((c) => (
                  <a
                    key={c.key}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border px-4 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
                  >
                    {c.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
