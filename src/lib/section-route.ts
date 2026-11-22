import { cache } from "react";
import { notFound } from "next/navigation";
import { getRoutingSections, safeDecodeSlug } from "@/lib/db-queries";
import { resolveSection, RETIRED_SECTION_SLUGS } from "@/lib/sections";

export const requireSection = cache(async (rawSlug: string) => {
  const slug = safeDecodeSlug(rawSlug);
  if (RETIRED_SECTION_SLUGS.includes(slug)) notFound();
  const section = resolveSection(slug, await getRoutingSections());
  if (!section) notFound();
  return section;
});
