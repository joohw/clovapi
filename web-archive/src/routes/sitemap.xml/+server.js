import { getPublicSiteUrl } from '$lib/publicSiteUrl.js';

/** 公开页面（不含需登录的管理页），便于搜索引擎与生成式检索发现 */
const PATHS = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/models', changefreq: 'daily', priority: '0.9' },
  { loc: '/docs', changefreq: 'weekly', priority: '0.9' },
  { loc: '/playground', changefreq: 'weekly', priority: '0.8' },
  { loc: '/login', changefreq: 'monthly', priority: '0.5' },
  { loc: '/register', changefreq: 'monthly', priority: '0.5' }
];

export function GET({ url }) {
  const site = getPublicSiteUrl(url);
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PATHS.map(
    (p) => `  <url>
    <loc>${site}${p.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
