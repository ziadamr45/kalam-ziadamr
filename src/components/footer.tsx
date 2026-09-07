import Link from "next/link";
import { SECTIONS } from "@/lib/sections";

export function Footer() {
  return (
    <footer className="site-footer mt-auto border-t" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div>
            <p className="font-ui text-xl font-bold" style={{ color: "var(--ink)" }}>
              كلام له لازمة
            </p>
            <p className="mt-1 max-w-sm text-sm leading-7" style={{ color: "var(--ink-muted)" }}>
              مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.
              <br />
              منصة فكرية نقية: بلا ضجيج، بلا إعلانات، بلا حشو.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              الأقسام
            </p>
            <ul className="space-y-2 text-sm">
              {SECTIONS.map((s) => (
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
              المنصة
            </p>
            <ul className="space-y-2 text-sm">
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
            </ul>
          </div>
        </div>

        <div
          className="mt-10 border-t pt-6 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}
        >
          نُشر بعناية.. لكلام له لازمة. © {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
