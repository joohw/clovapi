import { headers } from "next/headers";
import { buildSkillMarkdownFromRequest } from "@/lib/skill-markdown";

export async function GET() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const body = buildSkillMarkdownFromRequest(host);

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
