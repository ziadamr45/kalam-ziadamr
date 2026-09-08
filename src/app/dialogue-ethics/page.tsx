import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { LegalPageView, legalMetadata } from "@/components/legal-page-view";

export const revalidate = 300;

export const metadata: Metadata = legalMetadata("dialogue-ethics");

export default function DialogueEthicsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalPageView slug="dialogue-ethics" />
      </main>
      <Footer />
    </>
  );
}
