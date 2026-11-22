import { notFound } from "next/navigation";
import { getArticleBySlug, safeDecodeSlug } from "@/lib/db-queries";

// Validate above loading.tsx: once its fallback streams, HTTP 404 is too late.
// The React request cache shares this lookup with the page and metadata.
export default async function ArticleLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!await getArticleBySlug(safeDecodeSlug(slug))) notFound();
  return children;
}
