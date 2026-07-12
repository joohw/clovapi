import { getPublicSiteUrlFromRequest } from "@/lib/site";

export function buildSkillMarkdown(siteUrl: string): string {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return `# clovapi skill

Use this skill when a user wants to run model API requests through a local proxy, connect official subscriptions, configure custom upstreams, or debug model API traffic with clovapi.

## What clovapi does

clovapi runs a local HTTP proxy and exposes provider-scoped model API routes such as:

- \`http://127.0.0.1:27483/codex/v1/responses\`
- \`http://127.0.0.1:27483/claude-code/v1/messages\`
- \`http://127.0.0.1:27483/custom/v1/chat/completions\`

It supports official subscription sessions and custom API upstreams, then adapts common API styles: \`chat\`, \`responses\`, \`message\`, and \`gemini\`.

## Common commands

\`\`\`bash
npm i -g @clovapi/cli
clovapi proxy start
clovapi auth login --provider codex
clovapi profiles add --provider custom --api-style responses --model my-model
clovapi profiles test --provider custom --model my-model --json
\`\`\`

## Agent guidance

1. Prefer local proxy routes when the user wants one stable API base URL.
2. Use subscription login for built-in Codex or Claude subscription providers.
3. Use custom upstream profiles for third-party API keys and base URLs.
4. Match the client route to the API style: \`/v1/chat/completions\`, \`/v1/responses\`, \`/v1/messages\`, or Gemini-compatible paths.
5. When debugging, inspect call logs for inbound requests, upstream response chunks, token usage, and errors.

## References

- Website: ${baseUrl}
- Articles: ${baseUrl}/blog
- Skill markdown: ${baseUrl}/skill.md
- GitHub: https://github.com/joohw/clovapi
`;
}

export function buildSkillMarkdownFromRequest(host?: string): string {
  return buildSkillMarkdown(getPublicSiteUrlFromRequest(host));
}
