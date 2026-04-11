import { getPublicSiteUrl } from '$lib/publicSiteUrl.js';

export function GET({ url }) {
  const site = getPublicSiteUrl(url);

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    '# 常见生成式 /检索爬虫（可按合规要求改为 Disallow）',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
    'User-agent: anthropic-ai',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
