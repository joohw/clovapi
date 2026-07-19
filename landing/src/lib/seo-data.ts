import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home" | "skill" | "blog" | "about" | "privacy";
export type FaqItem = { question: string; answer: string };

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
};

export const SEO_COPY: Record<AppLanguage, Record<SeoPageKey, SeoCopy>> = {
  "zh-CN": {
    home: {
      title: "本地模型 API 代理 · clovapi",
      description:
        "clovapi 接入官方订阅和自定义上游，在本机提供统一的 OpenAI、Anthropic、Gemini 兼容模型 API。",
      ogImage: "/use-case-zh.png",
    },
    skill: {
      title: "Skill · clovapi",
      description: "给 AI 助手使用的 clovapi skill，说明本地代理、订阅接入和协议转换能力。",
      ogImage: "/use-case-zh.png",
    },
    blog: {
      title: "文章 · clovapi",
      description: "教程和博客文章，涵盖本地模型 API、订阅接入、协议转换和调用调试。",
      ogImage: "/use-case-zh.png",
    },
    about: {
      title: "关于 clovapi",
      description: "了解 clovapi 开源本地模型 API 代理的定位、维护方式与隐私边界。",
      ogImage: "/use-case-zh.png",
    },
    privacy: {
      title: "隐私说明 · clovapi",
      description: "clovapi 本地代理、桌面端和网站的数据处理与隐私说明。",
      ogImage: "/use-case-zh.png",
    },
  },
  en: {
    home: {
      title: "Local proxy and subscription conversion · clovapi",
      description:
        "clovapi runs a local HTTP proxy and converts official subscriptions or custom upstreams into OpenAI, Anthropic, and Gemini-compatible APIs.",
      ogImage: "/use-case-en.png",
    },
    skill: {
      title: "Skill · clovapi",
      description: "A clovapi skill for AI assistants covering local proxying, subscription access, and protocol conversion.",
      ogImage: "/use-case-en.png",
    },
    blog: {
      title: "Articles · clovapi",
      description: "Tutorials and posts on local model APIs, subscription access, protocol conversion, and call debugging.",
      ogImage: "/use-case-en.png",
    },
    about: {
      title: "About clovapi",
      description: "Learn about the goals, maintainers, and privacy boundaries of the open-source clovapi local model API proxy.",
      ogImage: "/use-case-en.png",
    },
    privacy: {
      title: "Privacy · clovapi",
      description: "How the clovapi local proxy, desktop app, and website handle data and protect user privacy.",
      ogImage: "/use-case-en.png",
    },
  },
};

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "clovapi 是什么？",
      answer: "clovapi 是运行在本机的模型 API 代理，用来接入官方订阅和自定义上游，并转换常见 API 协议。",
    },
    {
      question: "默认监听在哪里？",
      answer: "默认监听 http://127.0.0.1:27483，请求路径形如 /{providerId}/v1/...",
    },
    {
      question: "支持哪些协议？",
      answer: "支持 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses 和 Gemini 之间的转换。",
    },
  ],
  en: [
    {
      question: "What is clovapi?",
      answer: "clovapi is a local model API proxy for connecting official subscriptions and custom upstreams while converting common API protocols.",
    },
    {
      question: "Where does it listen?",
      answer: "By default it listens on http://127.0.0.1:27483 with paths like /{providerId}/v1/...",
    },
    {
      question: "Which protocols are supported?",
      answer: "Anthropic Messages, OpenAI Chat Completions, OpenAI Responses, and Gemini-compatible requests.",
    },
  ],
};

export function localizedPath(pathname: string, language: AppLanguage): string {
  const path = normalizePath(pathname);
  return `/${language}${path === "/" ? "" : path}`;
}

export function hreflangUrl(siteUrl: string, pathname: string, language: AppLanguage): string {
  return `${siteUrl}${localizedPath(pathname, language)}`;
}

export function resolvePageCopy(page: SeoPageKey, language: AppLanguage): SeoCopy {
  return SEO_COPY[language][page];
}

export function pathnameForPage(page: SeoPageKey): string {
  if (page === "home") return "/";
  return `/${page}`;
}

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
        sameAs: [
          "https://github.com/joohw/clovapi",
          "https://www.npmjs.com/package/@clovapi/cli",
        ],
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
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl}/#faq`,
    mainEntity: FAQ_ITEMS[language].map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
