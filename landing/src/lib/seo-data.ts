import type { AppLanguage } from "@/i18n/config";
import { normalizePath, SITE_NAME } from "@/lib/site";

export type SeoPageKey = "home" | "models" | "skill" | "blog" | "about" | "privacy";
export type FaqItem = { question: string; answer: string };

type SeoCopy = {
  title: string;
  description: string;
  ogImage: string;
};

export const SEO_COPY: Record<AppLanguage, Record<SeoPageKey, SeoCopy>> = {
  "zh-CN": {
    home: {
      title: "接入共享模型网络 | clovapi",
      description:
        "clovapi 是一个共享模型 API 网络：使用一个平台 API Key 发现并调用在线模型，无需安装 CLI 或先贡献资源。",
      ogImage: "/sharing-og.png",
    },
    models: {
      title: "模型 · clovapi",
      description: "查看 clovapi 当前可调用的共享模型、可用节点与近期请求量。",
      ogImage: "/sharing-og.png",
    },
    skill: {
      title: "Skill · clovapi",
      description: "给 AI 助手使用的 clovapi skill，说明共享模型发现、平台 API 调用与贡献节点接入。",
      ogImage: "/use-case-zh.png",
    },
    blog: {
      title: "博客 · clovapi",
      description: "教程和博客文章，涵盖本地模型 API、订阅接入、协议转换和调用调试。",
      ogImage: "/use-case-zh.png",
    },
    about: {
      title: "关于 clovapi",
      description: "了解 clovapi 的共享模型 API、积分结算机制，以及用于安全贡献资源的开源本地代理。",
      ogImage: "/sharing-og.png",
    },
    privacy: {
      title: "隐私说明 · clovapi",
      description: "clovapi 账户、调用凭证、贡献节点与开源本地代理的数据处理说明。",
      ogImage: "/use-case-zh.png",
    },
  },
  en: {
    home: {
      title: "Connect to the shared model network | clovapi",
      description:
        "clovapi is a shared model API network: discover and call online models with one platform API key, without installing the CLI or contributing first.",
      ogImage: "/sharing-og.png",
    },
    models: {
      title: "Models · clovapi",
      description: "Explore available shared models, serving nodes, and recent request volume on clovapi.",
      ogImage: "/sharing-og.png",
    },
    skill: {
      title: "Skill · clovapi",
      description: "A clovapi skill for AI assistants covering shared-model discovery, platform API calls, and contribution nodes.",
      ogImage: "/use-case-en.png",
    },
    blog: {
      title: "Articles · clovapi",
      description: "Tutorials and posts on local model APIs, subscription access, protocol conversion, and call debugging.",
      ogImage: "/use-case-en.png",
    },
    about: {
      title: "About clovapi",
      description: "Learn how clovapi shares model API capacity, settles contribution credits, and uses an open-source local proxy to contribute resources safely.",
      ogImage: "/sharing-og.png",
    },
    privacy: {
      title: "Privacy · clovapi",
      description: "How clovapi handles account, API credential, contribution node, and open-source local proxy data.",
      ogImage: "/use-case-en.png",
    },
  },
};

export const FAQ_ITEMS: Record<AppLanguage, FaqItem[]> = {
  "zh-CN": [
    {
      question: "现在可以做什么？",
      answer: "当前开发版支持创建调用凭证并调用在线模型。从控制台复制 clovapi share start --key … 命令，在本地运行后自动接入节点并同步可用模型；积分结算尚未开放。",
    },
    {
      question: "没有 API 可以分享，也能使用吗？",
      answer: "可以。创建平台 API Key 即可调用当前在线并开放共享的模型，无需先贡献 API。测试阶段按请求次数限额，免费额度发放尚未开放。",
    },
    {
      question: "贡献积分如何获得？",
      answer: "结算服务开放后，其他用户通过你的资源完成有效调用才会产生积分。接入或在线本身不计分，贡献资源需获得共享授权。",
    },
  ],
  en: [
    {
      question: "What’s available now?",
      answer: "Create a platform API key to call online models. Copy the clovapi share start --key … command from the console and run it locally to connect a CLI node and sync its available models automatically. Credit settlement is not yet available.",
    },
    {
      question: "Do I need to contribute an API?",
      answer: "No. Create a platform API key to call models that are online and accepting requests. The beta uses request-count limits. Free allowance grants are not yet available.",
    },
    {
      question: "How are contribution credits earned?",
      answer: "Once settlement is live, valid requests completed through your resources earn credits. Connecting or staying online alone does not. You must be authorized to share the resource.",
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
        name: "clovapi CLI",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        offers: {
          "@type": "Offer",
          name: language === "zh-CN" ? "开源贡献节点 CLI" : "Open-source contribution node CLI",
          price: "0",
          priceCurrency: "USD",
          url: "https://www.npmjs.com/package/@clovapi/cli",
        },
        description: language === "zh-CN"
          ? "clovapi 共享模型 API 网络的开源贡献节点 CLI，负责本地凭据保管、模型同步与协议转换；消费者无需安装。"
          : "The open-source contribution node CLI for the clovapi shared model API network. It keeps upstream credentials local, syncs models, and translates protocols; consumers do not need to install it.",
        url: "https://github.com/joohw/clovapi",
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
