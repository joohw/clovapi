import Link from "next/link";
import type { ApiDoc } from "@/lib/docs";
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
      <section className="panel relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:before:absolute md:before:inset-y-0 md:before:left-72 md:before:w-px md:before:bg-border md:before:content-['']">
        <div className="panel-body flex min-h-0 flex-1 flex-col overflow-hidden !p-0 md:flex-row">
          <aside className="min-h-0 shrink-0 border-b border-border bg-card md:w-72 md:border-b-0">
            <div className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">API 端点示例</div>
            <nav className="max-h-[40vh] overflow-auto pb-2 md:h-[calc(100%-2.5rem)] md:max-h-none">
              {docs.map((doc) => {
                const isActive = doc.slug === activeDoc?.slug;
                return (
                  <Link
                    key={doc.slug}
                    href={`/docs/${doc.slug}`}
                    className={`block w-full border-l-2 px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <p className="font-medium">{doc.title}</p>
                    <p className={`mt-1 text-xs ${isActive ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}>
                      {doc.description}
                    </p>
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:min-h-[calc(100dvh-8rem)]">
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
  );
}
