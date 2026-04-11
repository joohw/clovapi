import { getPublicSiteUrl } from '$lib/publicSiteUrl.js';

export function GET({ url }) {
  const site = getPublicSiteUrl(url);

  /** 面向 LLM / Agent 的站点摘要（llms.txt 惯例路径） */
  const body = `# CLOVAPI

> 高性能 AI 模型聚合网关：统一 OpenAI 兼容 API、多上游模型、计费与控制台。

## 站点
- 主页: ${site}/
- 机器可读站点地图: ${site}/sitemap.xml
- 本文件: ${site}/llms.txt

## 面向开发者与 Agent 的公开路径
- 文档与接入说明: ${site}/docs
- 模型列表（公开定价与能力）: ${site}/models
- 在线对话试用（通常需登录，视部署配置）: ${site}/playground
- 登录: ${site}/login
- 注册: ${site}/register

## API（OpenAI 兼容风格）
- 推荐 Base URL: ${site}/v1
- 认证: 请求头 \`Authorization: Bearer <用户 API 令牌>\`（令牌在用户控制台生成）
- 常见路径示例: \`/v1/chat/completions\`、\`/v1/embeddings\`、\`/v1/images/generations\` 等（以实例文档为准）

## 抓取
- robots.txt: ${site}/robots.txt
- 默认允许善意索引与 AI 检索；若需限制请在网关或 CDN 层调整 robots 与策略。

`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
