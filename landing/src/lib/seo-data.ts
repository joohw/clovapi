import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey =
  | "home"
  | "skill"
  | "agents"
  | "guides"
  | "blog"
  | "compareCcSwitch"
  | `agent:${string}`
  | `guide:${string}`;

export type AgentPageDef = {
  slug: string;
  cliFlag: string;
  icon: string;
  apiStyleKey: "anthropicMessages" | "openaiResponses" | "chatCompletions" | "gemini";
};

export const AGENT_PAGES: AgentPageDef[] = [
  { slug: "claude-code", cliFlag: "claude-code", icon: "/agenticons/claude-code.svg", apiStyleKey: "anthropicMessages" },
  { slug: "codex", cliFlag: "codex", icon: "/agenticons/codex.svg", apiStyleKey: "openaiResponses" },
  { slug: "opencode", cliFlag: "opencode", icon: "/agenticons/opencode.svg", apiStyleKey: "chatCompletions" },
  { slug: "openclaw", cliFlag: "openclaw", icon: "/agenticons/opencode.svg", apiStyleKey: "chatCompletions" },
  { slug: "hermes", cliFlag: "hermes", icon: "/agenticons/opencode.svg", apiStyleKey: "anthropicMessages" },
  { slug: "kimi-cli", cliFlag: "kimi-code", icon: "/agenticons/opencode.svg", apiStyleKey: "chatCompletions" },
];

export function agentBySlug(slug: string): AgentPageDef | undefined {
  return AGENT_PAGES.find((agent) => agent.slug === slug);
}

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
};

export const SEO_COPY: Record<
  AppLanguage,
  Record<Exclude<SeoPageKey, `agent:${string}`>, SeoCopy> & {
    agentTitle: (name: string) => string;
    agentDescription: (name: string) => string;
  }
> = {
  "zh-CN": {
    home: {
      title: "内置本地代理 · Agent CLI API 切换 · clovapi",
      description:
        "开源 CLI 与桌面客户端，以内置本地代理为核心：switch 后 Claude Code、Codex、OpenCode 等 Agent 统一走 localhost，由代理完成上游路由与 API 形态转码。add 保存 profile，switch 一键应用。",
      ogImage: "/use-case-zh.png",
    },
    skill: {
      title: "Agent Skill 文档 · clovapi",
      description: "clovapi Agent Skill：供 Claude Code、Codex 等 Agent 读取的安装与配置说明，支持 Markdown 机器可读格式。",
      ogImage: "/use-case-zh.png",
    },
    agents: {
      title: "支持的编程 Agent · clovapi 本地代理切换",
      description:
        "clovapi 经内置本地代理为 Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI 等 Agent 提供上游 API。查看各 CLI 的 API 形态与 switch 命令。",
      ogImage: "/use-case-zh.png",
    },
    compareCcSwitch: {
      title: "clovapi vs cc-switch · Agent CLI API 切换对比",
      description:
        "两者均支持桌面端与多 Agent CLI。clovapi 以内置本地代理为核心，switch 时经 localhost 完成 API 形态转码；cc-switch 侧重 GUI 统一管理、MCP/Skills 同步与可选代理接管。",
      ogImage: "/use-case-zh.png",
    },
    guides: {
      title: "Claude Code / Codex API 配置教程 · clovapi 本地代理",
      description:
        "分步教程：经 clovapi 本地代理为 Claude Code 接入 DeepSeek、OpenRouter、SiliconFlow 与第三方 API，以及 Codex CLI 上游配置。",
      ogImage: "/use-case-zh.png",
    },
    blog: {
      title: "博客 · clovapi Agent API 切换与本地代理",
      description:
        "clovapi 博客：编程 Agent CLI 本地代理架构、API 形态转码，以及 Claude Code / Codex 上游切换实践与深度解读。",
      ogImage: "/use-case-zh.png",
    },
    agentTitle: (name) => `${name} API 配置与切换 · clovapi`,
    agentDescription: (name) =>
      `用 clovapi 为 ${name} 配置上游 API：经内置本地代理转发请求，add 保存 profile、switch 一键应用。支持官方订阅与第三方 API。`,
  },
  en: {
    home: {
      title: "Built-in local proxy for agent CLI API switching · clovapi",
      description:
        "Open-source CLI and desktop app built around a local proxy: after switch, agent CLIs talk to localhost while clovapi routes upstream and transcodes API formats. Save profiles with add, apply with switch.",
      ogImage: "/use-case-en.png",
    },
    skill: {
      title: "Agent Skill · clovapi",
      description:
        "clovapi Agent Skill document for coding agents — install steps and configuration reference in machine-readable Markdown.",
      ogImage: "/use-case-en.png",
    },
    agents: {
      title: "Supported coding agents · clovapi local proxy switching",
      description:
        "clovapi serves Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, and more through its built-in local proxy. See API formats and switch commands per agent.",
      ogImage: "/use-case-en.png",
    },
    compareCcSwitch: {
      title: "clovapi vs cc-switch · agent CLI API switch comparison",
      description:
        "Both offer desktop apps and multi-CLI support. clovapi is built around a local proxy that transcodes API formats at switch time; cc-switch focuses on GUI provider management, MCP/Skills sync, and optional proxy takeover.",
      ogImage: "/use-case-en.png",
    },
    guides: {
      title: "Claude Code & Codex API setup guides · clovapi local proxy",
      description:
        "Step-by-step guides: route Claude Code through clovapi's local proxy for DeepSeek, OpenRouter, SiliconFlow, and third-party APIs, plus Codex CLI upstream setup.",
      ogImage: "/use-case-en.png",
    },
    blog: {
      title: "Blog · clovapi agent API switching & local proxy",
      description:
        "clovapi blog: local proxy architecture, API format transcoding, and practical notes on Claude Code / Codex upstream switching.",
      ogImage: "/use-case-en.png",
    },
    agentTitle: (name) => `Configure & switch ${name} API · clovapi`,
    agentDescription: (name) =>
      `Configure ${name} upstream APIs with clovapi — requests go through the built-in local proxy. Save profiles, probe connectivity, and apply with one switch command.`,
  },
};

const AGENT_DISPLAY_NAMES: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
    openclaw: "OpenClaw",
    hermes: "Hermes",
    "kimi-cli": "Kimi Code CLI",
  },
  en: {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
    openclaw: "OpenClaw",
    hermes: "Hermes",
    "kimi-cli": "Kimi Code CLI",
  },
};

export function agentDisplayName(slug: string, language: AppLanguage): string {
  return AGENT_DISPLAY_NAMES[language][slug] ?? slug;
}

export function hreflangUrl(siteUrl: string, pathname: string, language: AppLanguage): string {
  const path = normalizePath(pathname);
  const separator = path.includes("?") ? "&" : "?";
  return `${siteUrl}${path}${separator}lang=${encodeURIComponent(language)}`;
}

export function resolvePageCopy(page: SeoPageKey, language: AppLanguage, slugArg?: string): SeoCopy {
  const copy = SEO_COPY[language];
  if (page.startsWith("agent:")) {
    const slug = slugArg ?? page.slice("agent:".length);
    const name = agentDisplayName(slug, language);
    return {
      title: copy.agentTitle(name),
      description: copy.agentDescription(name),
      ogImage: copy.home.ogImage,
    };
  }
  return copy[page as Exclude<SeoPageKey, `agent:${string}` | `guide:${string}`>];
}

export function pathnameForPage(page: SeoPageKey, slugArg?: string): string {
  if (page === "home") return "/";
  if (page === "skill") return "/skill";
  if (page === "agents") return "/agents";
  if (page === "guides") return "/guides";
  if (page === "blog") return "/blog";
  if (page === "compareCcSwitch") return "/compare/cc-switch";
  if (page.startsWith("agent:")) {
    const slug = slugArg ?? page.slice("agent:".length);
    return `/agents/${slug}`;
  }
  if (page.startsWith("guide:")) {
    const slug = slugArg ?? page.slice("guide:".length);
    return `/guides/${slug}`;
  }
  return "/";
}

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "clovapi 是什么？和 API 网关有什么区别？",
      answer:
        "clovapi 是面向编程 Agent CLI 的上游 API 管理工具，内置本地代理为核心：switch 后 Agent 请求经 localhost 转发，由代理完成上游路由与 API 形态转码。用 clovapi add 保存 profile，clovapi switch 一键应用到目标 CLI。",
    },
    {
      question: "支持哪些 Agent CLI？",
      answer:
        "目前支持 Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI 等。switch 时会按 CLI 自动选择 anthropic、openai-responses、gemini 等 API 形态。",
    },
    {
      question: "官方订阅和第三方 API 可以同时管理吗？",
      answer:
        "可以。Claude Code 与 Codex 官方订阅可作为 profile 保存，与 OpenRouter、SiliconFlow 等第三方 API 同样支持 add 与 switch。",
    },
    {
      question: "clovapi 和 cc-switch 有什么区别？",
      answer:
        "两者都提供桌面客户端，并支持 Claude Code、Codex、OpenCode 等多 Agent CLI。clovapi 的核心是内置本地代理：switch 默认经 localhost 转发，由同一代理内核完成 anthropic / openai-responses 等形态转码。cc-switch 更侧重可视化 provider 管理、MCP/Skills/Prompts 同步与可选代理接管。详见 /compare/cc-switch。",
    },
    {
      question: "如何安装？",
      answer: "可通过 npm（npm i -g @clovapi/cli）、Homebrew 或 winget 安装 CLI，也可下载 macOS / Windows 桌面客户端进行图形化管理。",
    },
  ],
  en: [
    {
      question: "What is clovapi? How is it different from an API gateway?",
      answer:
        "clovapi manages upstream API profiles for coding agent CLIs with a built-in local proxy at its core. After switch, agent requests go through localhost while clovapi routes upstream and transcodes API formats. Use clovapi add to save profiles and clovapi switch to apply them.",
    },
    {
      question: "Which agent CLIs are supported?",
      answer:
        "Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, and more. At switch time clovapi picks the right API format (anthropic, openai-responses, gemini, etc.) for each CLI.",
    },
    {
      question: "Can I manage official subscriptions and third-party APIs together?",
      answer:
        "Yes. Claude Code and Codex official subscriptions can be saved as profiles alongside third-party providers such as OpenRouter or SiliconFlow.",
    },
    {
      question: "How does clovapi compare to cc-switch?",
      answer:
        "Both ship desktop apps and support multiple agent CLIs such as Claude Code, Codex, and OpenCode. clovapi is built around a local proxy: switch routes agents through localhost and transcodes anthropic / openai-responses / gemini formats in one place. cc-switch emphasizes GUI provider management, MCP/Skills/Prompts sync, and optional proxy takeover. See /compare/cc-switch for details.",
    },
    {
      question: "How do I install clovapi?",
      answer:
        "Install the CLI via npm (npm i -g @clovapi/cli), Homebrew, or winget — or download the macOS / Windows desktop app for a GUI workflow.",
    },
  ],
};

export function buildBaseJsonLdGraph(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        description: SEO_COPY[language].home.description,
        logo: `${siteUrl}/clover-light.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        description: SEO_COPY[language].home.description,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["zh-CN", "en"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "clovapi",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: SEO_COPY[language].home.description,
        url: siteUrl,
        downloadUrl: "https://www.npmjs.com/package/@clovapi/cli",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };
}

export function buildFaqJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
}): Record<string, unknown> {
  const { siteUrl, language } = options;
  const faqItems = FAQ_ITEMS[language];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl}/#faq`,
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function buildAgentPageJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
  agentSlug: string;
}): Record<string, unknown> {
  const { siteUrl, language, agentSlug } = options;
  const copy = resolvePageCopy(`agent:${agentSlug}`, language, agentSlug);
  const pageUrl = `${siteUrl}/agents/${agentSlug}`;
  const name = agentDisplayName(agentSlug, language);

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: copy.title,
    description: copy.description,
    isPartOf: { "@id": `${siteUrl}/#website` },
    about: { "@type": "SoftwareApplication", name },
    inLanguage: language,
  };
}

export function getHomeTitle(language: AppLanguage): string {
  return SEO_COPY[language].home.title;
}
