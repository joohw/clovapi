"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiDoc } from "@/lib/docs";
import { getDocEndpointPath } from "@/lib/docs";
import { getDocVariants } from "./docs-variants";
import { DocsApiTester } from "./docs-api-tester";
import { DocsOriginalDocPanel } from "./docs-original-doc-panel";

type DocsDocSectionProps = {
  activeDoc: ApiDoc;
  apiBaseUrl: string;
};

export function DocsDocSection({ activeDoc, apiBaseUrl }: DocsDocSectionProps) {
  const variants = useMemo(() => getDocVariants(activeDoc), [activeDoc]);
  const [sourceId, setSourceId] = useState(() => variants[0]?.id ?? "default");

  useEffect(() => {
    const first = variants[0]?.id ?? "default";
    setSourceId((prev) => (variants.some((v) => v.id === prev) ? prev : first));
  }, [activeDoc.slug, variants]);

  const sourcePresetBodies = useMemo(() => {
    const out: Partial<Record<string, string>> = {};
    for (const v of variants) {
      const raw = v.defaultRequestBody?.trim();
      if (raw) out[v.id] = raw;
    }
    return Object.keys(out).length ? out : undefined;
  }, [variants]);

  const multiSource = variants.length > 1;

  return (
    <>
      <div className="flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden border-b border-border">
        <DocsOriginalDocPanel
          variants={variants}
          activeSourceId={sourceId}
          onActiveSourceIdChange={setSourceId}
        />
      </div>
      <div className="flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden">
        <DocsApiTester
          apiBaseUrl={apiBaseUrl}
          endpointPath={getDocEndpointPath(activeDoc.slug)}
          slug={activeDoc.slug}
          docSourceId={multiSource ? sourceId : undefined}
          sourcePresetBodies={multiSource ? sourcePresetBodies : undefined}
        />
      </div>
    </>
  );
}
