import Link from "next/link";
import type { ApiDoc } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { DocsDocSection } from "./docs-doc-section";

type DocsLayoutProps = {
  docs: ApiDoc[];
  activeSlug: string;
  apiBaseUrl: string;
};

export function DocsLayout({ docs, activeSlug, apiBaseUrl }: DocsLayoutProps) {
  const activeDoc = docs.find((doc) => doc.slug === activeSlug) ?? docs[0];

  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 min-w-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
      <section className="panel relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="panel-body flex min-h-0 flex-1 flex-col gap-4 overflow-hidden !p-0 md:flex-row md:gap-5">
          <aside
            className={cn(
              "flex min-h-0 shrink-0 flex-col rounded-2xl bg-background/70 backdrop-blur-md dark:bg-background/55",
              "md:w-72 md:self-stretch",
            )}
          >
            <nav className="max-h-[40vh] overflow-auto p-2 pt-3 md:h-full md:max-h-none md:p-3 md:pt-3">
              {docs.map((doc) => {
                const isActive = doc.slug === activeDoc?.slug;
                return (
                  <Link
                    key={doc.slug}
                    href={`/docs/${doc.slug}`}
                    className={cn(
                      "block w-full rounded-xl px-3 py-2 text-sm transition-colors md:px-3",
                      isActive
                        ? "bg-muted/45 text-foreground dark:bg-muted/35"
                        : "text-foreground hover:bg-muted/30 dark:hover:bg-muted/25",
                    )}
                  >
                    <p className="font-medium">{doc.title}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        isActive ? "text-muted-foreground" : "text-muted-foreground/85",
                      )}
                    >
                      {doc.description}
                    </p>
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background/70 backdrop-blur-md dark:bg-background/55",
              "md:min-h-[calc(100dvh-8rem)]",
            )}
          >
            {activeDoc ? (
              <DocsDocSection key={activeDoc.slug} activeDoc={activeDoc} apiBaseUrl={apiBaseUrl} />
            ) : (
              <div className="p-4 text-sm text-zinc-500">
                <p>暂无文档配置。</p>
              </div>
            )}
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
