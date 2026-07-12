import { headers } from "next/headers";
import { buildSkillMarkdownFromRequest } from "@/lib/skill-markdown";

export async function GET() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const markdown = buildSkillMarkdownFromRequest(host);

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, follow",
    },
  });
}
