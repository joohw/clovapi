"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast-provider";

function SnippetBlock({
  title,
  content,
  onCopy,
  copyLabel,
}: {
  title: string;
  content: string;
  onCopy: (value: string) => Promise<void>;
  copyLabel: string;
}) {
  return (
    <section className="panel">
      <div className="panel-body">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => void onCopy(content)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {copyLabel}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/35 p-3 text-xs leading-relaxed text-foreground">
          <code>{content}</code>
        </pre>
      </div>
    </section>
  );
}

export default function SkillPage() {
  const { t } = useTranslation();
  const { showError, showSuccess } = useToast();
  const [clientOrigin, setClientOrigin] = useState("");

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  const baseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || clientOrigin || "http://localhost:27483",
    [clientOrigin],
  );

  const envSnippet = useMemo(
    () => `# CLOVAPI credentials
export CLOVAPI_BASE_URL="${baseUrl}"
export CLOVAPI_API_KEY="<YOUR_CLOVAPI_KEY>"`,
    [baseUrl],
  );

  const skillPromptSnippet = useMemo(
    () => `You are an agent that must call CLOVAPI as an OpenAI-compatible gateway.

Rules:
1) Always use base URL: ${baseUrl}
2) Always send Authorization: Bearer $CLOVAPI_API_KEY
3) Before task execution, call GET /v1/models and pick an available model.
4) Prefer streaming requests when client supports stream output.
5) On 401/403, stop and ask for key/permission check.
6) On 429/5xx, retry with exponential backoff (max 3 attempts).
7) Return concise, user-readable error messages on final failure.
`,
    [baseUrl],
  );

  const requestSnippet = useMemo(
    () => `curl "${baseUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CLOVAPI_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role":"system","content":"You are a helpful coding assistant."},
      {"role":"user","content":"Hello from CLOVAPI"}
    ],
    "stream": true
  }'`,
    [baseUrl],
  );

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(t("skill.copied"));
    } catch {
      showError(t("skill.copyFailed"));
    }
  }

  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-4 px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
        <section className="panel">
          <div className="panel-body">
            <h1 className="text-2xl font-semibold tracking-tight">{t("skill.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("skill.subtitle")}</p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-foreground/90">
              <li>{t("skill.step1")}</li>
              <li>{t("skill.step2")}</li>
              <li>{t("skill.step3")}</li>
              <li>{t("skill.step4")}</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/docs"
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                {t("skill.docsButton")}
              </Link>
              <a
                href="https://github.com/joohw/clovapi"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                {t("skill.githubButton")}
              </a>
            </div>
          </div>
        </section>

        <SnippetBlock title={t("skill.envTitle")} content={envSnippet} onCopy={copy} copyLabel={t("skill.copy")} />
        <SnippetBlock title={t("skill.promptTitle")} content={skillPromptSnippet} onCopy={copy} copyLabel={t("skill.copy")} />
        <SnippetBlock title={t("skill.requestTitle")} content={requestSnippet} onCopy={copy} copyLabel={t("skill.copy")} />

        <section className="panel">
          <div className="panel-body">
            <h2 className="text-base font-semibold tracking-tight">{t("skill.notesTitle")}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/90">
              <li>{t("skill.note1")}</li>
              <li>{t("skill.note2")}</li>
              <li>{t("skill.note3")}</li>
              <li>{t("skill.note4")}</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
