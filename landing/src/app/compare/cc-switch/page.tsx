import { CompareCcSwitchContent } from "@/components/compare/compare-cc-switch-content";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildPageMetadata("compareCcSwitch");
}

export default function CompareCcSwitchPage() {
  return <CompareCcSwitchContent />;
}
