import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, rateLimitDurable, requestIp } from "@/lib/rate-limit";

/**
 * محرك البحث الفكري الفوري — يغذي نافذة Cmd+K السينمائية.
 * يبحث في عناوين المقالات المنشورة وموجزها ومتنها بأمانة، ويعيد مع كل
 * نتيجة مقطعًا مقتطفًا من المتن حول موضع المطابقة ليُبرزها المُبرز في الواجهة.
 */

export const dynamic = "force-dynamic";

type Hit = {
  slug: string;
  title: string;
  summary: string;
  section: string | null;
  sectionColor: string | null;
  readingTimeSec: number;
  views: number;
  snippet: string | null;
};

function buildSnippet(content: string, q: string): string | null {
  if (!q) return null;
  const lower = content.toLowerCase();
  const at = lower.indexOf(q.toLowerCase());
  if (at < 0) return null;
  const from = Math.max(0, at - 60);
  const raw = content.slice(from, at + q.length + 90).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${raw}…`;
}

export async function GET(request: Request) {
  try {
    /* درع مزدوج للبحث: 30 استعلامًا/دقيقة لكل IP — ذاكرة النسخة فوريًا
       وعداد دائم عابر للنسخ عبر RequestLog يغلق ما تفلته نسخ Serverless
       المتوازية، فلا استنزاف لاستعلامات Neon النصية المتكررة
       دون أي إحساس لدى القارئ البشري */
    const ip = requestIp(request);
    const mem = rateLimit(`search:${ip}`, 30, 60_000);
    const durable = await rateLimitDurable({ path: "/api/search", ip, limit: 30, windowMs: 60_000 });
    if (!mem.ok || !durable.ok) {
      return NextResponse.json(
        { ok: false, error: "استعلامات كثيرة — مهلة قصيرة" },
        { status: 429 },
      );
    }

    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ ok: true, hits: [] as Hit[] });

    const rows = await prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
      take: 12,
      select: {
        slug: true,
        title: true,
        summary: true,
        content: true,
        views: true,
        readingTimeSec: true,
        section: { select: { name: true, color: true } },
      },
    });

    const hits: Hit[] = rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      section: r.section?.name ?? null,
      sectionColor: r.section?.color ?? null,
      readingTimeSec: r.readingTimeSec,
      views: r.views,
      snippet: buildSnippet(r.content, q),
    }));

    return NextResponse.json({ ok: true, hits });
  } catch {
    return NextResponse.json({ ok: true, hits: [] });
  }
}
