import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home" | "skill" | "agents" | "guides" | "compareCcSwitch" | `agent:${string}` | `guide:${string}`;

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
  { slug: "kimi-cli", cliFlag: "kimi-cli", icon: "/agenticons/opencode.svg", apiStyleKey: "chatCompletions" },
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
      title: "Claude Code / Codex API 一键切换 · clovapi 开源 CLI",
      description:
        "开源 CLI 与桌面客户端：统一管理 Claude Code、Codex、OpenCode 等编程 Agent 的上游 API。支持官方订阅与第三方接口，clovapi add 保存、switch 一键写入配置。",
      ogImage: "/use-case-zh.png",
    },
    skill: {
      title: "Agent Skill 文档 · clovapi",
      description: "clovapi Agent Skill：供 Claude Code、Codex 等 Agent 读取的安装与配置说明，支持 Markdown 机器可读格式。",
      ogImage: "/use-case-zh.png",
    },
    agents: {
      title: "支持的编程 Agent · clovapi API 切换",
      description:
        "clovapi 支持 Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI 等 Agent。查看各 CLI 的上游 API 形态与 switch 命令。",
      ogImage: "/use-case-zh.png",
    },
    compareCcSwitch: {
      title: "clovapi vs cc-switch · 编程 Agent API 切换对比",
      description:
        "对比 clovapi 与 cc-switch：多 CLI 支持、Codex 官方订阅、API 形态自动映射与开源跨平台安装方式。",
      ogImage: "/use-case-zh.png",
    },
    guides: {
      title: "Claude Code / Codex API 配置教程 · clovapi",
      description:
        "分步教程：Claude Code 接入 DeepSeek、OpenRouter、SiliconFlow 与第三方 API，以及 Codex CLI 上游配置。",
      ogImage: "/use-case-zh.png",
    },
    agentTitle: (name) => `${name} API 配置与切换 · clovapi`,
    agentDescription: (name) =>
      `用 clovapi 管理 ${name} 的上游 API：保存 profile、探测连通性，一行 switch 写入 CLI 配置。支持官方订阅与第三方 API。`,
  },
  en: {
    home: {
      title: "Switch Claude Code & Codex API in One Command · clovapi",
      description:
        "Open-source CLI and desktop app to manage upstream APIs for Claude Code, Codex, OpenCode, and more. Official subscriptions and third-party providers — add once, switch anytime.",
      ogImage: "/use-case-en.png",
    },
    skill: {
      title: "Agent Skill · clovapi",
      description:
        "clovapi Agent Skill document for coding agents — install steps and configuration reference in machine-readable Markdown.",
      ogImage: "/use-case-en.png",
    },
    agents: {
      title: "Supported coding agents · clovapi API switching",
      description:
        "clovapi works with Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, and more. See API formats and switch commands per agent.",
      ogImage: "/use-case-en.png",
    },
    compareCcSwitch: {
      title: "clovapi vs cc-switch · coding agent API switch comparison",
      description:
        "Compare clovapi and cc-switch: multi-CLI support, Codex subscriptions, automatic API-style mapping, and cross-platform open-source installs.",
      ogImage: "/use-case-en.png",
    },
    guides: {
      title: "Claude Code & Codex API setup guides · clovapi",
      description:
        "Step-by-step guides: third-party APIs for Claude Code (DeepSeek, OpenRouter, SiliconFlow) and Codex CLI upstream configuration.",
      ogImage: "/use-case-en.png",
    },
    agentTitle: (name) => `Configure & switch ${name} API · clovapi`,
    agentDescription: (name) =>
      `Manage ${name} upstream APIs with clovapi — save profiles, probe connectivity, and apply with one switch command. Official subscriptions and third-party APIs supported.`,
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
        "clovapi 是面向编程 Agent CLI（如 Claude Code、Codex）的上游 API 配置管理工具，不是通用 API 网关。它用 clovapi add 保存 profile，用 clovapi switch 一键写入目标 CLI 的配置。",
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
        "cc-switch 主要面向 Claude Code 环境变量切换；clovapi 额外支持 Codex、OpenCode 等多 CLI，并在 switch 时自动匹配各 CLI 需要的 API 协议形态。详见 /compare/cc-switch。",
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
        "clovapi manages upstream API profiles for coding agent CLIs such as Claude Code and Codex — it is not a general-purpose API gateway. Use clovapi add to save profiles and clovapi switch to write them into the target CLI config.",
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
        "cc-switch focuses on Claude Code env-var switching. clovapi adds Codex, OpenCode, and other CLIs, with automatic API-style mapping per agent. See /compare/cc-switch for details.",
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
