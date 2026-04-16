import { headers } from "next/headers";
import { getPublicSiteUrlFromRequest } from "@/lib/site";

export async function GET() {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const site = getPublicSiteUrlFromRequest(host);
  const body = `# CLOVAPI

> 高性能 AI 模型聚合网关：统一 OpenAI 兼容 API、多上游模型、计费与控制台。

## 站点
- 主页: ${site}/
- 机器可读站点地图: ${site}/sitemap.xml
- 本文件: ${site}/llms.txt

## 面向开发者与 Agent 的公开路径
- 文档与接入说明: ${site}/docs
- 模型列表（公开定价与能力）: ${site}/models
- 登录: ${site}/login
- 注册: ${site}/register

## API（OpenAI 兼容风格）
- 推荐 Base URL: ${site}/v1
- 认证: 请求头 \`Authorization: Bearer <用户 API 令牌>\`

## 抓取
- robots.txt: ${site}/robots.txt
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
