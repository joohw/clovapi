import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home";
export type FaqItem = { question: string; answer: string };

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
};

export const SEO_COPY: Record<AppLanguage, Record<SeoPageKey, SeoCopy>> = {
  "zh-CN": {
    home: {
      title: "模型供应商的本地 API 代理 · clovapi",
      description:
        "clovapi 保存 provider profile，启动本地 HTTP 代理，按 provider 路由，并在 OpenAI、Anthropic、Gemini 兼容请求之间转换协议。",
      ogImage: "/use-case-zh.png",
    },
  },
  en: {
    home: {
      title: "Local API proxy for model providers · clovapi",
      description:
        "clovapi stores provider profiles, runs a local HTTP proxy, routes requests by provider, and transcodes OpenAI, Anthropic, and Gemini-compatible API formats.",
      ogImage: "/use-case-en.png",
    },
  },
};

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "clovapi 是什么？",
      answer: "clovapi 是运行在本机的 API 代理，用来保存 provider profile、路由请求并转换常见模型 API 协议。",
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
      answer: "clovapi is a local API proxy that stores provider profiles, routes requests, and converts common model API protocols.",
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

export function hreflangUrl(siteUrl: string, pathname: string, language: AppLanguage): string {
  const path = normalizePath(pathname);
  const separator = path.includes("?") ? "&" : "?";
  return `${siteUrl}${path}${separator}lang=${encodeURIComponent(language)}`;
}

export function resolvePageCopy(page: SeoPageKey, language: AppLanguage): SeoCopy {
  return SEO_COPY[language][page];
}

export function pathnameForPage(_page: SeoPageKey): string {
  return "/";
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

export function getHomeTitle(language: AppLanguage): string {
  return SEO_COPY[language].home.title;
}
