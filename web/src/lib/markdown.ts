import { Marked } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: true,
});

export async function renderMarkdown(markdown: string): Promise<string> {
  return marked.parse(markdown);
}
