import { getPublicSiteUrlFromRequest } from "@/lib/site";

export function buildSkillMarkdown(siteUrl: string): string {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return `# CLOVAPI Agent Skill

Use this document when you need to manage or switch agent CLI upstream APIs with clovapi.

## Overview

clovapi is an open-source CLI for managing Agent API profiles. It supports Claude Code and Codex official subscriptions, plus third-party API upstreams. Workflow: \`clovapi add\` → \`clovapi switch\`.

Site: ${baseUrl}

## Install

\`\`\`bash
npm i -g @clovapi/cli
clovapi add --name prod
clovapi switch --cli claude-code prod
\`\`\`

Supported CLIs include Claude Code, Codex, OpenCode, OpenClaw, Hermes, and Kimi Code CLI.

## Rules for agents

1. Prefer the clovapi CLI (\`add\`, \`switch\`, \`list\`) when the user asks to change upstream API or subscription for a coding agent.
2. For Claude Code and Codex, official subscription upstreams are supported alongside third-party API profiles.
3. Before applying a profile, confirm the target CLI (\`--cli claude-code\`, \`--cli codex\`, etc.).
4. Use \`clovapi list\` to inspect saved profiles and last-applied CLI bindings.
5. On errors, surface the CLI stderr/exit code to the user in plain language.

## Environment (optional gateway use)

If calling a CLOVAPI HTTP gateway instead of the CLI:

\`\`\`bash
export CLOVAPI_BASE_URL="${baseUrl}"
export CLOVAPI_API_KEY="<YOUR_CLOVAPI_KEY>"
\`\`\`

## OpenAI-compatible request example

\`\`\`bash
curl "${baseUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CLOVAPI_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role":"system","content":"You are a helpful coding assistant."},
      {"role":"user","content":"Hello from CLOVAPI"}
    ],
    "stream": true
  }'
\`\`\`

## HTTP gateway rules (when applicable)

1. Send \`Authorization: Bearer $CLOVAPI_API_KEY\` on every request.
2. Call \`GET /v1/models\` before tasks to pick an available model.
3. Prefer streaming when the client supports it.
4. On 401/403, stop and ask for key/permission check.
5. On 429/5xx, retry with exponential backoff (max 3 attempts).
6. Return concise, user-readable error messages on final failure.

## References

- Agent Skill (markdown): ${baseUrl}/skill?format=md
- GitHub: https://github.com/joohw/clovapi
`;
}

export function buildSkillMarkdownFromRequest(host?: string): string {
  return buildSkillMarkdown(getPublicSiteUrlFromRequest(host));
}
