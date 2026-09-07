import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="text-center">
        <p className="font-body text-6xl font-bold" style={{ color: "var(--accent)" }}>
          ٤٠٤
        </p>
        <h1 className="font-body mt-4 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          هذه الصفحة ليس لها لازمة
        </h1>
        <p className="font-body mt-3 leading-9" style={{ color: "var(--ink-muted)" }}>
          أو ربما تغيّر عنوانها.. الكلام المهم لم يعدل مكانًا بعيدًا.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full px-6 py-3 text-sm font-semibold shadow-soft transition-all hover:scale-105"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
