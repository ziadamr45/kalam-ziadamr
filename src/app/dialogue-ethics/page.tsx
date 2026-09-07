import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { LegalPageView, legalMetadata } from "@/components/legal-page-view";

export const revalidate = 300;

export const metadata: Metadata = legalMetadata("dialogue-ethics");

export default function DialogueEthicsPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LegalPageView slug="dialogue-ethics" />
      </main>
      <Footer />
    </>
  );
}
