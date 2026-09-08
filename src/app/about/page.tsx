import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "عن المنصة",
  description: "فلسفة «كلام له لازمة» ومعايير النشر الصارمة قبل أن يرى أي مقال النور.",
};

const CHECKLIST = [
  "هل يضيف المقال قيمة حقيقية قابلة للإحساس أو التطبيق؟",
  "هل هو خالٍ من الحشو والتكرار والسطحية؟",
  "هل الفكرة واضحة من العنوان والمختصر دون تشتيت؟",
  "هل اللغة رصينة ومحترمة ومخالصة للقارئ؟",
  "هل يخلو مما يخالف الشريعة والقيم العربية الأصيلة؟",
  "هل النسخة المشكولة دقيقة إعرابيًا وتشكيليًا؟",
  "هل تستحق هذه الكلمات أن تكون «لازمة» يرجع إليها القارئ؟",
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-32 pb-8 text-center sm:px-6">
          <h1 className="font-body text-4xl font-bold leading-[1.6]" style={{ color: "var(--ink)" }}>
            عن المنصة
          </h1>
          <div className="mx-auto my-5 h-[3px] w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-strong))" }} />
          <p className="font-body text-xl leading-10" style={{ color: "var(--ink-muted)" }}>
            مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
          <div className="font-body space-y-6 text-lg leading-10" style={{ color: "var(--ink)" }}>
            <p>
              وُلدت «كلام له لازمة» من قناعة بسيطة: أن فضاء المعرفة العربي يحتاج نقاءً أكثر مما يحتاج
              كثرة. نحيط أنفسنا بتيار لا يتوقف من المقالات السطحية، والعناوين المصدومة، والإعلانات
              التي تطارد القارئ من أول سطر إلى آخره. قررنا أن نبني العكس تمامًا: مكان هادئ، نظيف،
              محترم لذهن قارئه ووقته.
            </p>
            <p>
              هنا لا ننشر إلا ما مرّ عبر فحص أخلاقي صارم قبل النشر، ولا تُولَّد مقالات آليًا إطلاقًا؛
              كل كلمة تكتبها وتراجعها يد إعداد التحرير، وتُقدَّم بنسختين: نسخة انسيابية للقراءة
              السريعة، ونسخة مشكولة بالكامل لطلاب اللغة والمعلمين — لأن العربية تستحق هذا العناية.
            </p>
            <p>
              لا نطاردك بإشعارات، ولا نبيع بياناتك، ولا نعترض رؤيتك بإعلانات. المقياس واحد: إن لم
              يكن لهذا الكلام لازمة، فهو ليس منّا.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
          <h2 className="font-ui mb-6 text-2xl font-bold" style={{ color: "var(--ink)" }}>
            معايير «له لازمة» قبل النشر
          </h2>
          <ol className="space-y-3">
            {CHECKLIST.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-4 rounded-2xl border p-5 shadow-soft"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <span
                  className="font-ui mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  {new Intl.NumberFormat("ar-EG").format(i + 1)}
                </span>
                <p className="font-body leading-9" style={{ color: "var(--ink)" }}>
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
