import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LegalPageView, legalMetadata } from "@/components/legal-page-view";

export const revalidate = 300;

export const metadata: Metadata = legalMetadata("terms");

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LegalPageView slug="terms" />
      </main>
      <Footer />
    </>
  );
}
