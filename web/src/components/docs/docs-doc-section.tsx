import type { ApiDoc } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";
import styles from "./docs-layout.module.css";

type DocsDocSectionProps = {
  activeDoc: ApiDoc;
};

export async function DocsDocSection({ activeDoc }: DocsDocSectionProps) {
  const html = await renderMarkdown(activeDoc.content);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-11 shrink-0 items-center border-b border-border px-4 md:px-5">
        <h2 className="text-sm font-semibold text-foreground">{activeDoc.title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 md:px-5">
        <article
          className={styles.markdown}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
