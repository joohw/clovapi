import { AgentsIndexContent } from "@/components/agents/agents-index-content";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildPageMetadata("agents");
}

export default function AgentsIndexPage() {
  return <AgentsIndexContent />;
}
