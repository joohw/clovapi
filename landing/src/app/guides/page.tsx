import { GuidesIndexContent } from "@/components/guides/guides-index-content";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildPageMetadata("guides");
}

export default function GuidesIndexPage() {
  return <GuidesIndexContent />;
}
