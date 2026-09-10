import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalPageView, legalMetadata } from "@/components/legal-page-view";

export const revalidate = 300;

export const metadata: Metadata = legalMetadata("terms");

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <LegalPageView slug="terms" />
      </main>
      <SiteFooter />
    </>
  );
}
