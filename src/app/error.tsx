"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="text-center">
        <h1 className="font-body text-3xl font-bold" style={{ color: "var(--ink)" }}>
          حدث خلل بسيط
        </h1>
        <p className="font-body mt-4 leading-9" style={{ color: "var(--ink-muted)" }}>
          شيء ما لم يعمل كما يجب.. جرّب مرة أخرى.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-full px-6 py-3 text-sm font-semibold shadow-soft transition-all hover:scale-105"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
