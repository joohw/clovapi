import { notFound } from "next/navigation";
import { AgentGuideContent } from "@/components/agents/agent-guide-content";
import { StructuredData } from "@/components/structured-data";
import { agentBySlug, AGENT_PAGES, buildAgentPageJsonLd, buildPageMetadata, resolveSeoLanguage, resolveSiteUrl } from "@/lib/seo";

type AgentPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return AGENT_PAGES.map((agent) => ({ slug: agent.slug }));
}

export async function generateMetadata({ params }: AgentPageProps) {
  const { slug } = await params;
  if (!agentBySlug(slug)) return {};
  return buildPageMetadata(`agent:${slug}`, slug);
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { slug } = await params;
  const agent = agentBySlug(slug);
  if (!agent) notFound();

  const [siteUrl, language] = await Promise.all([resolveSiteUrl(), resolveSeoLanguage()]);
  const jsonLd = buildAgentPageJsonLd({ siteUrl, language, agentSlug: slug });

  return (
    <>
      <StructuredData data={jsonLd} />
      <AgentGuideContent agent={agent} />
    </>
  );
}
