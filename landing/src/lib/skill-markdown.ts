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
6. Use \`clovapi proxy start\` when the user needs the local proxy daemon; do not assume a remote CLOVAPI HTTP API.

## References

- Agent Skill (markdown): ${baseUrl}/skill?format=md
- GitHub: https://github.com/joohw/clovapi
`;
}

export function buildSkillMarkdownFromRequest(host?: string): string {
  return buildSkillMarkdown(getPublicSiteUrlFromRequest(host));
}
