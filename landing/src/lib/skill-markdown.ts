import { getPublicSiteUrlFromRequest } from "@/lib/site";

export function buildSkillMarkdown(siteUrl: string): string {
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return `# clovapi skill

Use this skill when a user wants to discover or call shared models through clovapi, integrate the platform API, contribute an authorized model resource, or use the advanced local proxy.

## What clovapi does

clovapi is a shared model API network. Consumers create one platform API key and call models that are currently online through:

- \`GET https://api.clovapi.com/v1/models\`
- \`POST https://api.clovapi.com/v1/chat/completions\`
- \`POST https://api.clovapi.com/v1/responses\`

Consumers do not need to install the CLI, configure an upstream, or contribute capacity first. The CLI is an optional contribution-node runtime: it keeps upstream credentials local, advertises available model IDs, and adapts common API styles.

## Consumer workflow

\`\`\`bash
curl https://api.clovapi.com/v1/models \\
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY"

curl https://api.clovapi.com/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"MODEL_FROM_LIST","messages":[{"role":"user","content":"Hello"}]}'
\`\`\`

Create the Consumer API Key in the clovapi console. Use the complete model ID returned by \`/v1/models\`; never guess or silently substitute a model.

## Contributor workflow

\`\`\`bash
npm i -g @clovapi/cli
clovapi share start --key YOUR_CLI_CONNECTION_KEY
\`\`\`

Configure and test only upstream resources the contributor is authorized to share. The node automatically syncs locally available models. Consumer API keys, CLI connection keys, and node credentials are not interchangeable.

## Agent guidance

1. Prefer the platform \`/v1\` API when the user wants to use shared models.
2. Query \`/v1/models\` before selecting a model because online supply can change.
3. Do not require CLI installation or contribution for consumer-only use.
4. Use the CLI sharing flow only when the user wants to contribute an authorized resource.
5. Treat the local proxy as an advanced node-side capability, not clovapi's primary product identity.

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
