const zhCN = {
  header: {
    home: "首页",
    docs: "文档",
    models: "模型",
    agents: "智能体",
    backHome: "返回首页",
    github: "GitHub",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    pageTitle: "将 {{client}} 切换为任意上游 · {{siteName}}",
    title: "开源 API 切换器",
    subtitle:
      "在 Claude Code、Codex、OpenCode 等Agent CLI 中保持同一套接入方式，无需反复改配置；clovapi 帮你把请求切换到不同上游，实现故障切换与灵活选路。",
    tagline: "Agent-first · High-performance API",
    installCommand: "安装命令",
    copyInstallCommand: "复制 {{label}} 安装命令",
    copySuccess: "安装命令已复制到剪贴板",
    copyFailed: "复制失败",
    tutorial: "查看教程",
    apiStyles: "兼容4种 API 风格",
    originalDocs: {
      chatCompletions: "原始文档：/v1/chat/completions",
      anthropicMessages: "原始文档：/v1/messages",
      openaiResponses: "原始文档：/v1/responses",
      gemini: "原始文档：Gemini GenerateContent",
    },
    openInNewTab: "查看「{{label}}」（新标签页打开）",
    openDoc: "查看「{{label}}」",
    providersTitle: "多家供应商，一处切换",
    providersSubtitle:
      "同一套 SDK / CLI / Agent 配置，后端按需映射通道——对标 IDE 里「切换服务商」，只是把切换放到了网关侧。",
    footerCopyright: "© 2026 CLOVAPI",
  },
} as const;

export default zhCN;
