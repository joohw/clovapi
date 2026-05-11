import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs/docs-layout";
import { getApiDocs } from "@/lib/docs";

type DocsBySlugPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DocsBySlugPage({ params }: DocsBySlugPageProps) {
  const { slug } = await params;
  const docs = await getApiDocs();
  if (!docs.some((doc) => doc.slug === slug)) {
    notFound();
  }
  return <DocsLayout docs={docs} activeSlug={slug} />;
}
