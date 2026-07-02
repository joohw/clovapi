const zhCN = {
  header: {
    home: "首页",
    backHome: "返回首页",
    github: "GitHub",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "模型供应商的本地 API 代理",
    subtitle:
      "保存 provider profile，启动本地 HTTP 代理，按 provider 路由，并在 OpenAI、Anthropic、Gemini 兼容请求之间转换协议。",
    quickStart: "快速开始",
    quickStartHint: "代理在本地监听，并通过 provider id 路由请求。",
    useCaseAlt: "ClovAPI 桌面端展示本地代理 profiles 与日志",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    apiStyles: "协议格式",
    apiStylesSubtitle: "clovapi 在代理边界转换常见模型 API 格式。",
    featuresTitle: "clovapi 做什么",
    featuresSubtitle: "一个小型本地代理核心，提供 profile 存储、路由、协议转换和日志。",
    features: {
      profiles: {
        title: "Profiles",
        description: "在本地 profiles 文件中保存 base URL、API key、API style 和模型设置。",
      },
      switch: {
        title: "Provider 路由",
        description: "通过 /custom-api/v1/responses 这类 provider 作用域路径转发本地请求。",
      },
      subscription: {
        title: "本地代理",
        description: "默认在 127.0.0.1:27483 启动本地 HTTP 服务。",
      },
      multiCli: {
        title: "调用日志",
        description: "查看入站请求、上游响应、token 用量和系统日志。",
      },
      apiStyle: {
        title: "协议转换",
        description: "桥接 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses 和 Gemini。",
      },
      opensource: {
        title: "开源",
        description: "Go core、npm launcher，以及可选 Electron 桌面端。",
      },
    },
    downloadMac: "下载 macOS 版",
    downloadWindows: "下载 Windows 版",
    ctaTitle: "按你的方式运行",
    ctaSubtitle: "Go CLI、npm launcher、桌面端都使用同一份本地 profiles 文件。",
    ctaGithub: "查看 GitHub",
    apiStyleItems: {
      chatCompletions: {
        title: "openai-chat",
        description: "/v1/chat/completions，适用于 OpenAI 兼容聊天客户端。",
      },
      anthropicMessages: {
        title: "anthropic",
        description: "/v1/messages，适用于 Anthropic Messages 兼容请求。",
      },
      openaiResponses: {
        title: "openai-responses",
        description: "/v1/responses，适用于 OpenAI Responses 兼容请求。",
      },
      gemini: {
        title: "gemini",
        description: "兼容 GenerateContent 的 Gemini 请求。",
      },
    },
    footerTagline: "模型供应商的本地 API 代理",
    footerCopyright: "(c) 2026 clovapi",
  },
} as const;

export default zhCN;
