import { DocsLayout } from "@/components/docs/docs-layout";
import { getApiDocs } from "@/lib/docs";
import { headers } from "next/headers";

export default async function DocsPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const requestOrigin = host.startsWith("http://") || host.startsWith("https://") ? host : `${proto}://${host}`;
  const envBase = (process.env.NEXT_PUBLIC_SERVER_URL || "").trim().replace(/\/+$/, "");
  const serverAddress = envBase || requestOrigin;
  const apiBaseUrl = serverAddress.endsWith("/v1") ? serverAddress : `${serverAddress}/v1`;
  const docs = await getApiDocs({ baseUrl: apiBaseUrl });
  const first = docs[0]?.slug || "";
  return <DocsLayout docs={docs} activeSlug={first} apiBaseUrl={apiBaseUrl} />;
}
