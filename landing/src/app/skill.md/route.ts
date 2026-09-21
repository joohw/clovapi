import { buildSkillMarkdown } from "@/lib/skill-markdown";
import { PUBLIC_SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const markdown = buildSkillMarkdown(PUBLIC_SITE_URL);

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, follow",
    },
  });
}
