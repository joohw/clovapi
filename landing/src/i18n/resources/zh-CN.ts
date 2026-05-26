const zhCN = {
  header: {
    home: "首页",
    agents: "Agent",
    guides: "教程",
    blog: "博客",
    skill: "Skill",
    backHome: "返回首页",
    github: "GitHub",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "轻松管理 Agent API",
    subtitle:
      "内置本地代理，支持将 Claude Code 订阅、Codex 订阅一键转换成本地 API，一键切换 Agent API。",
    quickStart: "安装 CLI 版本",
    quickStartHint:
      "添加的API profile 会经由本地代理提供给目标 Agent CLI",
    useCaseAlt: "ClovAPI Switcher 桌面客户端界面：管理 Claude Code、Codex 等 Agent 的 API 上游",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    apiStyles: "深度支持四种 API 形态",
    apiStylesSubtitle: "switch 时按 CLI 自动选择最合适的上游 API 形态，无需手动对照风格表。",
    featuresTitle: "CLI 能做什么",
    featuresSubtitle: "官方订阅与第三方 API 统一管理，一行命令切换 Claude Code、Codex 等 Agent 上游。",
    features: {
      profiles: {
        title: "clovapi add",
        description: "保存上游 profile（官方订阅或第三方 API），持久化前先探测连通性。",
      },
      switch: {
        title: "clovapi switch",
        description: "将 profile 应用到目标 CLI。交互式选择，或脚本里用 --cli 指定 Claude Code、Codex 等。",
      },
      subscription: {
        title: "官方订阅支持",
        description: "支持 Claude Code 与 Codex 官方订阅上游，与第三方 API profile 同样一键切换。",
      },
      multiCli: {
        title: "多 CLI 适配",
        description: "覆盖 Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI 等编程 Agent。",
      },
      apiStyle: {
        title: "API 形态自动映射",
        description: "switch 时按 CLI 自动匹配 anthropic、openai-responses、gemini 等上游协议。",
      },
      opensource: {
        title: "开源跨平台",
        description: "Go 编写，支持 npm、Homebrew、winget 安装；配置保存在 ~/.config/clovapi。",
      },
    },
    downloadMac: "下载 macOS 客户端",
    downloadWindows: "下载 Windows 客户端",
    installAgentSkill: "安装 Agent Skill",
    ctaTitle: "多种使用方式",
    ctaSubtitle: "图形界面管理 Agent API，也支持 CLI 一行命令安装与切换。",
    ctaGithub: "GitHub 源码",
    apiStyleItems: {
      chatCompletions: {
        title: "openai-chat",
        description: "/v1/chat/completions · Chat Completions 协议，兼容多数 OpenAI 风格 SDK。",
      },
      anthropicMessages: {
        title: "anthropic",
        description: "/v1/messages · Anthropic Messages API，Claude Code 等 Agent 原生形态。",
      },
      openaiResponses: {
        title: "openai-responses",
        description: "/v1/responses · OpenAI Responses API，Codex 等 Agent 优先使用的形态。",
      },
      gemini: {
        title: "gemini",
        description: "GenerateContent · Google Gemini API，面向 Gemini 系 CLI 与工具链。",
      },
    },
    footerTagline: "内置本地代理 · 轻松管理 Agent API",
    footerCopyright: "© 2026 clovapi",
  },
  agents: {
    indexTitle: "支持的编程 Agent",
    indexSubtitle: "clovapi 为各 Agent CLI 自动匹配上游 API 形态，一行 switch 写入配置。",
    pageTitle: "管理 {{name}} 的 API 上游",
    pageSubtitle: "用 clovapi add 保存 profile，再用 clovapi switch 一键切换 {{name}} 的官方订阅或第三方 API。",
    apiStyleTitle: "自动匹配的 API 形态",
    apiStyleSubtitle: "switch 到 {{name}} 时，clovapi 会自动选择该 CLI 需要的上游协议。",
    moreAgentsTitle: "其他支持的 Agent",
    compareLink: "clovapi 与 cc-switch 对比 →",
    guidesTitle: "相关教程",
  },
  guides: {
    indexTitle: "配置教程",
    indexSubtitle: "分步指南：Claude Code / Codex 接入第三方 API 与常见上游（DeepSeek、OpenRouter、SiliconFlow）。",
    tipsLabel: "提示",
  },
  blog: {
    indexTitle: "博客",
    indexSubtitle: "围绕 Reddit / 社区热议：OAuth 禁令、代理泛滥、省钱路由、多 Agent 切换与 Cursor 终端实践。",
    empty: "暂无文章。",
    backToBlog: "← 返回博客",
    viewGuides: "查看配置教程 →",
  },
  compare: {
    title: "clovapi vs cc-switch",
    subtitle:
      "两者都支持桌面端与多 Agent CLI。clovapi 以内置本地代理为核心，switch 时经 localhost 完成 API 形态转码与上游路由。",
    feature: "功能",
    yes: "支持",
    no: "—",
    rows: {
      localProxyCore: "内置本地代理（核心架构）",
      multiCli: "多 CLI（Codex、OpenCode 等）",
      codex: "Codex 官方订阅",
      apiStyle: "API 形态自动转码",
      claudeCode: "Claude Code 配置切换",
      openSource: "开源",
      desktop: "桌面客户端",
      mcpSkills: "MCP / Skills / Prompts 同步",
    },
    whenClovapiTitle: "什么时候选 clovapi？",
    whenClovapiBody:
      "你希望 switch 默认经内置本地代理转发，由同一代理内核完成 anthropic / openai-responses / gemini 等形态转码，或用轻量 Go CLI + 可选桌面端管理 profile。",
    whenCcSwitchTitle: "什么时候选 cc-switch？",
    whenCcSwitchBody:
      "你需要 MCP/Skills/Prompts 跨 CLI 同步、Gemini CLI 支持，或更完整的桌面运维面板（会话搜索、云同步、可选代理接管等）。",
    agentsLink: "查看支持的 Agent 列表 →",
  },
  skill: {
    agentHintTitle: "安装 ClovAPI Skill",
    agentHint: "将下方提示词交给 Agent，让它先读取 Skill 文档再操作。",
    agentPromptLabel: "提示词",
    agentPrompt: "请访问 {{url}} 学习完整的 Agent Skill 文档",
    copy: "复制",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败",
  },
} as const;

export default zhCN;
