import type { AppLanguage } from "@/i18n/config";
import { agentDisplayName } from "@/lib/seo-data";

export type GuidePageDef = {
  slug: string;
  agentSlug: string;
  vendorLabel?: string;
  priority: number;
};

export const GUIDE_PAGES: GuidePageDef[] = [
  { slug: "claude-code-third-party-api", agentSlug: "claude-code", priority: 0.95 },
  { slug: "claude-code-deepseek", agentSlug: "claude-code", vendorLabel: "DeepSeek", priority: 0.9 },
  { slug: "claude-code-openrouter", agentSlug: "claude-code", vendorLabel: "OpenRouter", priority: 0.9 },
  { slug: "claude-code-siliconflow", agentSlug: "claude-code", vendorLabel: "SiliconFlow", priority: 0.88 },
  { slug: "codex-third-party-api", agentSlug: "codex", priority: 0.9 },
];

export function guideBySlug(slug: string): GuidePageDef | undefined {
  return GUIDE_PAGES.find((guide) => guide.slug === slug);
}

export type GuideStep = { title: string; body: string; command?: string };

export type GuideContent = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  steps: GuideStep[];
  tips: string;
};

const GUIDE_CONTENT: Record<AppLanguage, Record<string, GuideContent>> = {
  "zh-CN": {
    "claude-code-third-party-api": {
      metaTitle: "Claude Code 接入第三方 API 教程 · clovapi",
      metaDescription:
        "用 clovapi 为 Claude Code 配置第三方 API：add 保存 profile、switch 写入 anthropic 形态，支持 OpenRouter、DeepSeek、SiliconFlow 等上游。",
      h1: "Claude Code 接入第三方 API",
      intro:
        "Claude Code 原生使用 Anthropic Messages API。clovapi 在 switch 时会自动把 profile 映射为 Claude Code 需要的 anthropic 形态，无需手动改环境变量或对照协议表。",
      steps: [
        {
          title: "安装 clovapi",
          body: "通过 npm 安装 CLI，或使用桌面客户端。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "保存第三方 API profile",
          body: "运行 add 并按提示填写上游 Base URL、API Key 与模型 ID。持久化前会自动探测连通性。",
          command: "clovapi add --name my-api",
        },
        {
          title: "切换到 Claude Code",
          body: "将 Custom API 下的模型绑定下发到 Claude Code 配置。之后启动 claude 即走该上游。",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <model-id>",
        },
      ],
      tips: "可同时保存多个 profile（官方订阅、不同第三方），随时 switch 切换。详见 /agents/claude-code。",
    },
    "claude-code-deepseek": {
      metaTitle: "Claude Code 接入 DeepSeek API · clovapi 教程",
      metaDescription:
        "用 clovapi 让 Claude Code 使用 DeepSeek 上游：add 保存 DeepSeek profile，switch 自动写入 anthropic 协议配置。",
      h1: "Claude Code 接入 DeepSeek",
      intro:
        "若你已有 DeepSeek API 或兼容端点，可用 clovapi 保存为 profile 并一键切换到 Claude Code，无需手动设置 ANTHROPIC_BASE_URL。",
      steps: [
        {
          title: "安装 clovapi",
          body: "全局安装 CLI。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "添加 DeepSeek profile",
          body: "在 add 交互流程中填写 DeepSeek 的 Base URL、API Key 与模型名（如 deepseek-chat 或你账户可用的模型 ID）。",
          command: "clovapi add --name deepseek",
        },
        {
          title: "应用到 Claude Code",
          body: "switch 时 clovapi 会选择 anthropic API 形态写入 Claude Code。",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model deepseek-chat",
        },
      ],
      tips: "DeepSeek 端点需支持 Claude Code 所需的 Messages 协议；若连通性探测失败，请检查 Base URL 与模型 ID。",
    },
    "claude-code-openrouter": {
      metaTitle: "Claude Code 接入 OpenRouter · clovapi 教程",
      metaDescription:
        "用 clovapi 为 Claude Code 配置 OpenRouter 上游：保存 profile 后 switch 一键切换，自动匹配 anthropic API 形态。",
      h1: "Claude Code 接入 OpenRouter",
      intro:
        "OpenRouter 提供多模型统一入口。通过 clovapi 保存 OpenRouter profile 后，可与其他上游一样一键 switch 到 Claude Code。",
      steps: [
        {
          title: "安装 clovapi",
          body: "全局安装 CLI。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "添加 OpenRouter profile",
          body: "在 add 中填写 OpenRouter Base URL（通常为 https://openrouter.ai/api/v1）、API Key 与目标模型 slug。",
          command: "clovapi add --name openrouter",
        },
        {
          title: "切换到 Claude Code",
          body: "下发 OpenRouter 模型绑定到 Claude Code。",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <openrouter-model-slug>",
        },
      ],
      tips: "OpenRouter 模型 slug 可在 OpenRouter 文档中查询；切换官方订阅时只需 switch 到对应 subscription profile。",
    },
    "claude-code-siliconflow": {
      metaTitle: "Claude Code 接入 SiliconFlow · clovapi 教程",
      metaDescription:
        "用 clovapi 为 Claude Code 配置 SiliconFlow（硅基流动）API：add 保存、switch 写入，自动 anthropic 形态映射。",
      h1: "Claude Code 接入 SiliconFlow",
      intro:
        "SiliconFlow 是国内常用的模型 API 平台。clovapi 可将 SiliconFlow profile 一键应用到 Claude Code，省去手动配置环境变量。",
      steps: [
        {
          title: "安装 clovapi",
          body: "全局安装 CLI 或使用桌面客户端。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "添加 SiliconFlow profile",
          body: "在 add 流程中填写 SiliconFlow API Base URL、Key 与模型名称（参考 SiliconFlow 控制台）。",
          command: "clovapi add --name siliconflow",
        },
        {
          title: "切换到 Claude Code",
          body: "一行命令写入 Claude Code 的模型绑定。",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <siliconflow-model-id>",
        },
      ],
      tips: "请确认所选 SiliconFlow 模型支持 Anthropic Messages 兼容模式；探测失败时检查 API 权限与模型 ID。",
    },
    "codex-third-party-api": {
      metaTitle: "Codex CLI 接入第三方 API 教程 · clovapi",
      metaDescription:
        "用 clovapi 为 Codex CLI 配置第三方 API：switch 时自动使用 openai-responses 形态，支持官方订阅与自定义上游。",
      h1: "Codex 接入第三方 API",
      intro:
        "Codex CLI 优先使用 OpenAI Responses API。clovapi switch 到 codex 时会自动选择 openai-responses 协议，无需手动对照路径后缀。",
      steps: [
        {
          title: "安装 clovapi",
          body: "全局安装 CLI。",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "保存上游 profile",
          body: "add 时填写第三方 Responses 兼容端点的 Base URL、Key 与模型。",
          command: "clovapi add --name codex-api",
        },
        {
          title: "切换到 Codex",
          body: "将模型绑定应用到 Codex CLI。",
          command: "clovapi switch --cli codex --vendor \"Custom API\" --model <responses-model-id>",
        },
      ],
      tips: "Codex 官方订阅也可作为 profile 保存，与第三方 API 同样 switch。详见 /agents/codex。",
    },
  },
  en: {
    "claude-code-third-party-api": {
      metaTitle: "Use third-party APIs with Claude Code · clovapi guide",
      metaDescription:
        "Configure third-party upstream APIs for Claude Code with clovapi — add a profile, switch once, and get automatic anthropic-style mapping.",
      h1: "Third-party APIs for Claude Code",
      intro:
        "Claude Code speaks Anthropic Messages API. At switch time, clovapi maps your profile to the anthropic format Claude Code expects — no manual env-var matrix.",
      steps: [
        {
          title: "Install clovapi",
          body: "Install via npm, or use the desktop app.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Save a third-party profile",
          body: "Run add and enter upstream base URL, API key, and model ID. Connectivity is probed before persist.",
          command: "clovapi add --name my-api",
        },
        {
          title: "Apply to Claude Code",
          body: "Write the Custom API model binding into Claude Code config. Launch claude with that upstream.",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <model-id>",
        },
      ],
      tips: "Save multiple profiles (official subscription, different vendors) and switch anytime. See /agents/claude-code.",
    },
    "claude-code-deepseek": {
      metaTitle: "Claude Code with DeepSeek API · clovapi guide",
      metaDescription:
        "Point Claude Code at DeepSeek using clovapi — save a DeepSeek profile and switch with automatic anthropic mapping.",
      h1: "Claude Code with DeepSeek",
      intro:
        "If you have a DeepSeek API or compatible endpoint, clovapi can save it as a profile and apply it to Claude Code without hand-editing ANTHROPIC_BASE_URL.",
      steps: [
        {
          title: "Install clovapi",
          body: "Install the global CLI.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Add a DeepSeek profile",
          body: "In the add wizard, enter DeepSeek base URL, API key, and model ID (e.g. deepseek-chat or your account model).",
          command: "clovapi add --name deepseek",
        },
        {
          title: "Apply to Claude Code",
          body: "clovapi picks the anthropic API style when switching to Claude Code.",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model deepseek-chat",
        },
      ],
      tips: "The endpoint must support what Claude Code needs for Messages API. If the probe fails, verify base URL and model ID.",
    },
    "claude-code-openrouter": {
      metaTitle: "Claude Code with OpenRouter · clovapi guide",
      metaDescription:
        "Configure OpenRouter for Claude Code with clovapi — save once, switch anytime, automatic anthropic mapping.",
      h1: "Claude Code with OpenRouter",
      intro:
        "OpenRouter gives you many models behind one API. Save an OpenRouter profile in clovapi and switch it to Claude Code like any other upstream.",
      steps: [
        {
          title: "Install clovapi",
          body: "Install the global CLI.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Add an OpenRouter profile",
          body: "In add, enter OpenRouter base URL (typically https://openrouter.ai/api/v1), API key, and model slug.",
          command: "clovapi add --name openrouter",
        },
        {
          title: "Apply to Claude Code",
          body: "Switch the OpenRouter model binding into Claude Code.",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <openrouter-model-slug>",
        },
      ],
      tips: "Look up model slugs in OpenRouter docs. Switch back to official subscription by selecting that profile instead.",
    },
    "claude-code-siliconflow": {
      metaTitle: "Claude Code with SiliconFlow · clovapi guide",
      metaDescription:
        "Configure SiliconFlow for Claude Code with clovapi — add a profile, switch once, automatic anthropic mapping.",
      h1: "Claude Code with SiliconFlow",
      intro:
        "SiliconFlow is a popular model API platform. clovapi applies a SiliconFlow profile to Claude Code in one switch — no manual env setup.",
      steps: [
        {
          title: "Install clovapi",
          body: "Install the CLI or desktop app.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Add a SiliconFlow profile",
          body: "In add, enter SiliconFlow API base URL, key, and model name from your console.",
          command: "clovapi add --name siliconflow",
        },
        {
          title: "Apply to Claude Code",
          body: "One command writes the Claude Code model binding.",
          command: "clovapi switch --cli claude-code --vendor \"Custom API\" --model <siliconflow-model-id>",
        },
      ],
      tips: "Confirm the SiliconFlow model supports Anthropic Messages compatibility. If probing fails, check API permissions and model ID.",
    },
    "codex-third-party-api": {
      metaTitle: "Third-party APIs for Codex CLI · clovapi guide",
      metaDescription:
        "Configure third-party upstream APIs for Codex with clovapi — automatic openai-responses mapping at switch time.",
      h1: "Third-party APIs for Codex",
      intro:
        "Codex CLI prefers OpenAI Responses API. clovapi selects openai-responses when you switch to codex — no manual path suffix guessing.",
      steps: [
        {
          title: "Install clovapi",
          body: "Install the global CLI.",
          command: "npm i -g @clovapi/cli",
        },
        {
          title: "Save an upstream profile",
          body: "In add, enter a Responses-compatible base URL, key, and model.",
          command: "clovapi add --name codex-api",
        },
        {
          title: "Apply to Codex",
          body: "Switch the model binding into Codex CLI.",
          command: "clovapi switch --cli codex --vendor \"Custom API\" --model <responses-model-id>",
        },
      ],
      tips: "Official Codex subscription profiles work the same way. See /agents/codex.",
    },
  },
};

export function getGuideContent(slug: string, language: AppLanguage): GuideContent | undefined {
  return GUIDE_CONTENT[language][slug];
}

export function guidePathname(slug: string): string {
  return `/guides/${slug}`;
}

export function buildGuideHowToJsonLd(options: {
  siteUrl: string;
  language: AppLanguage;
  slug: string;
}): Record<string, unknown> {
  const { siteUrl, language, slug } = options;
  const content = getGuideContent(slug, language);
  const guide = guideBySlug(slug);
  if (!content || !guide) return {};

  const pageUrl = `${siteUrl}${guidePathname(slug)}`;
  const agentName = agentDisplayName(guide.agentSlug, language);

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${pageUrl}#howto`,
    name: content.h1,
    description: content.intro,
    inLanguage: language,
    about: { "@type": "SoftwareApplication", name: agentName },
    step: content.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      ...(step.command ? { itemListElement: { "@type": "HowToDirection", text: step.command } } : {}),
    })),
  };
}

export function guidesForAgent(agentSlug: string): GuidePageDef[] {
  return GUIDE_PAGES.filter((guide) => guide.agentSlug === agentSlug);
}
