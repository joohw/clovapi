import type { AppLanguage } from "@/i18n/config";

export type GuideStep = { title: string; body: string; command?: string };

export type GuideContent = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  steps: GuideStep[];
  tips: string;
};

export const GUIDE_SLUGS = [
  "quick-start-local-proxy",
  "subscription-to-api",
  "api-style-routing",
] as const;

export type GuideSlug = (typeof GUIDE_SLUGS)[number];

const GUIDE_CONTENT: Record<AppLanguage, Record<GuideSlug, GuideContent>> = {
  "zh-CN": {
    "quick-start-local-proxy": {
      slug: "quick-start-local-proxy",
      title: "快速启动本地代理",
      description: "安装 clovapi，启动本地代理，并用稳定的本地 URL 调用模型 API。",
      intro: "用最少步骤把 clovapi 跑起来：安装 CLI、启动代理、添加上游，再从客户端发起请求。",
      steps: [
        {
          title: "安装 CLI",
          body: "通过 npm 安装 clovapi。也可以使用桌面端管理配置和日志。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "启动代理",
          body: "代理默认监听 127.0.0.1:27483，所有请求都从本机进入。",
          command: "clovapi proxy start",
        },
        {
          title: "添加上游",
          body: "保存 base URL、API key、API 风格和模型名称。保存后即可用 provider id 组成本地入口。",
          command: "clovapi profiles add --provider custom-api --api-style responses --model my-model",
        },
        {
          title: "发起请求",
          body: "把客户端的 base URL 指到本地代理路径，例如 /custom-api/v1/responses。",
          command: "http://127.0.0.1:27483/custom-api/v1/responses",
        },
      ],
      tips: "桌面端会显示代理状态和调用日志，适合调试上游连通性、模型名称和协议格式。",
    },
    "subscription-to-api": {
      slug: "subscription-to-api",
      title: "把官方订阅接入本地 API",
      description: "通过 clovapi 登录 Codex 或 Claude 订阅，并在本地暴露为可调用的模型 API。",
      intro: "官方订阅可以和自定义 API 一样通过本地入口调用，适合统一客户端配置和调用日志。",
      steps: [
        {
          title: "登录订阅",
          body: "使用桌面端登录，或通过 CLI 打开 OAuth 登录流程。",
          command: "clovapi auth login --provider codex",
        },
        {
          title: "启动代理",
          body: "登录态保存在本机，代理会在请求时为对应上游构造认证信息。",
          command: "clovapi proxy start",
        },
        {
          title: "使用订阅入口",
          body: "订阅供应商有固定 provider id，例如 codex 或 claude-code。",
          command: "http://127.0.0.1:27483/codex/v1/responses",
        },
      ],
      tips: "订阅登录态、请求日志和模型配置都留在本机；切换客户端时只需要复用本地 URL。",
    },
    "api-style-routing": {
      slug: "api-style-routing",
      title: "选择 API 风格和模型路径",
      description: "理解 chat、responses、message、gemini 四种入口，按客户端需要选择请求格式。",
      intro: "clovapi 在本地做协议适配。客户端可以继续使用熟悉的 API 风格，上游配置负责实际转发。",
      steps: [
        {
          title: "选择 API 风格",
          body: "配置上游时选择 chat、responses、message 或 gemini。",
          command: "clovapi profiles add --provider custom-api --api-style chat",
        },
        {
          title: "使用对应路径",
          body: "OpenAI Chat 使用 /v1/chat/completions，Responses 使用 /v1/responses，Anthropic 使用 /v1/messages。",
          command: "/custom-api/v1/chat/completions\n/custom-api/v1/responses\n/custom-api/v1/messages",
        },
        {
          title: "查看日志",
          body: "在桌面端调用日志中查看入站请求、上游响应片段、token 用量和错误。",
        },
      ],
      tips: "如果客户端报协议错误，先确认路径和 api_style 是否匹配，再检查模型 ID 与上游支持情况。",
    },
  },
  en: {
    "quick-start-local-proxy": {
      slug: "quick-start-local-proxy",
      title: "Start the local proxy",
      description: "Install clovapi, start the local proxy, and call model APIs through a stable localhost URL.",
      intro: "Bring clovapi online with a short path: install the CLI, start the proxy, add an upstream, and point clients at localhost.",
      steps: [
        {
          title: "Install the CLI",
          body: "Install clovapi with npm. The desktop app can manage the same proxy, settings, and logs.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Start the proxy",
          body: "The proxy listens on 127.0.0.1:27483 by default.",
          command: "clovapi proxy start",
        },
        {
          title: "Add an upstream",
          body: "Save the base URL, API key, API style, and model name. The provider id becomes part of the local URL.",
          command: "clovapi profiles add --provider custom-api --api-style responses --model my-model",
        },
        {
          title: "Send requests",
          body: "Point the client base URL to the local proxy path, such as /custom-api/v1/responses.",
          command: "http://127.0.0.1:27483/custom-api/v1/responses",
        },
      ],
      tips: "Use the desktop app to inspect proxy status and call logs while debugging upstream connectivity, model names, and protocol format.",
    },
    "subscription-to-api": {
      slug: "subscription-to-api",
      title: "Use subscriptions as local APIs",
      description: "Sign in to Codex or Claude subscriptions and expose them as callable local model APIs.",
      intro: "Official subscriptions can be called through the same localhost flow as custom upstream APIs.",
      steps: [
        {
          title: "Sign in",
          body: "Use the desktop app or the CLI OAuth flow.",
          command: "clovapi auth login --provider codex",
        },
        {
          title: "Start the proxy",
          body: "Session data stays local. The proxy builds upstream auth when requests arrive.",
          command: "clovapi proxy start",
        },
        {
          title: "Call the subscription endpoint",
          body: "Built-in subscriptions use stable provider ids such as codex and claude-code.",
          command: "http://127.0.0.1:27483/codex/v1/responses",
        },
      ],
      tips: "Keep subscription sessions, call logs, and model settings local; reuse the same local URL across clients.",
    },
    "api-style-routing": {
      slug: "api-style-routing",
      title: "Pick API styles and routes",
      description: "Understand chat, responses, message, and gemini routes, then choose the request format your client expects.",
      intro: "clovapi adapts protocols locally. Clients keep their familiar API shape while upstream settings handle forwarding.",
      steps: [
        {
          title: "Choose an API style",
          body: "Configure upstreams as chat, responses, message, or gemini.",
          command: "clovapi profiles add --provider custom-api --api-style chat",
        },
        {
          title: "Use the matching path",
          body: "OpenAI Chat uses /v1/chat/completions, Responses uses /v1/responses, and Anthropic uses /v1/messages.",
          command: "/custom-api/v1/chat/completions\n/custom-api/v1/responses\n/custom-api/v1/messages",
        },
        {
          title: "Inspect logs",
          body: "Use the desktop call log to inspect inbound requests, upstream response chunks, token usage, and errors.",
        },
      ],
      tips: "If a client reports a protocol error, first check the route and api_style, then verify the model id upstream supports.",
    },
  },
};

export function getGuideContent(slug: string, language: AppLanguage): GuideContent | undefined {
  if (!GUIDE_SLUGS.includes(slug as GuideSlug)) return undefined;
  return GUIDE_CONTENT[language][slug as GuideSlug];
}
