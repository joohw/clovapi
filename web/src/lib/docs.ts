import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "@/lib/markdown";

const DOCS_DIR = path.join(process.cwd(), "docs");

const DOC_NAV_ORDER = [
  "chat-completions",
  "responses",
  "claude-messages",
  "search",
  "embeddings",
  "rerank",
  "images-generations",
  "audio-speech",
] as const;

const DOC_SUFFIX_BY_SLUG: Record<string, string> = {
  "chat-completions": "/chat/completions",
  responses: "/responses",
  "claude-messages": "/messages",
  search: "/search",
  embeddings: "/embeddings",
  rerank: "/rerank",
  "images-generations": "/images/generations",
  "audio-speech": "/audio/speech",
};

export type ApiDoc = {
  slug: string;
  title: string;
  description: string;
  html: string;
};

type GetApiDocsOptions = {
  baseUrl?: string;
};

function toTitleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseTitle(markdown: string, slug: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return toTitleFromSlug(slug);
}

function parseDescription(slug: string): string {
  return DOC_SUFFIX_BY_SLUG[slug] || "";
}

export async function getApiDocs(options?: GetApiDocsOptions): Promise<ApiDoc[]> {
  let entries: string[];
  try {
    entries = await readdir(DOCS_DIR);
  } catch {
    return [];
  }

  const mdFiles = entries.filter((name) => name.toLowerCase().endsWith(".md"));
  const docs = await Promise.all(
    mdFiles.map(async (filename) => {
      const slug = filename.replace(/\.md$/i, "");
      const fullPath = path.join(DOCS_DIR, filename);
      const rawMarkdown = await readFile(fullPath, "utf-8");
      const baseUrl = options?.baseUrl?.trim();
      const markdown = baseUrl
        ? rawMarkdown
            .replace(/\$\{BASE_URL\}/g, baseUrl)
            .replace(/http:\/\/localhost:3000\/v1/g, baseUrl)
        : rawMarkdown;
      const title = parseTitle(markdown, slug);
      const description = parseDescription(slug);
      const html = await renderMarkdown(markdown);
      return { slug, title, description, html };
    }),
  );
  const order = new Map<string, number>(DOC_NAV_ORDER.map((slug, idx) => [slug, idx]));
  docs.sort((a, b) => {
    const ai = order.has(a.slug) ? (order.get(a.slug) as number) : Number.MAX_SAFE_INTEGER;
    const bi = order.has(b.slug) ? (order.get(b.slug) as number) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.slug.localeCompare(b.slug);
  });
  return docs;
}
