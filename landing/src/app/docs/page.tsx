import { DocsLayout } from "@/components/docs/docs-layout";
import { getApiDocs } from "@/lib/docs";

export default async function DocsPage() {
  const docs = await getApiDocs();
  const first = docs[0]?.slug || "";
  return <DocsLayout docs={docs} activeSlug={first} />;
}
