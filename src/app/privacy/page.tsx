import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { LegalPageView, legalMetadata } from "@/components/legal-page-view";

export const revalidate = 300;

export const metadata: Metadata = legalMetadata("privacy");

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalPageView slug="privacy" />
      </main>
      <Footer />
    </>
  );
}
