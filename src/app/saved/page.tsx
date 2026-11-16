import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import SavedClient from "./saved-client";

export default function SavedPage() {
  return (
    <>
      <SiteHeader />
      <SavedClient />
      <SiteFooter />
    </>
  );
}
