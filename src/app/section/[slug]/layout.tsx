import { permanentRedirect } from "next/navigation";
import { safeDecodeSlug } from "@/lib/db-queries";
import { requireSection } from "@/lib/section-route";

// Resolve redirects/404 before the loading boundary can commit a 200 response.
export default async function SectionLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const rawSlug = (await params).slug;
  const slug = safeDecodeSlug(rawSlug);
  const section = await requireSection(rawSlug);
  if (section.slug !== slug) {
    permanentRedirect(`/section/${encodeURIComponent(section.slug)}`);
  }
  return children;
}
