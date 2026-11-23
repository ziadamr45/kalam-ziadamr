import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import OfflineReader from "./offline-reader";

export default function ReadOfflinePage() {
  return (
    <>
      <SiteHeader />
      <OfflineReader />
      <SiteFooter />
    </>
  );
}
