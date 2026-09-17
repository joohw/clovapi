const zhCN = {
  header: {
    home: "首页",
    skill: "Skill",
    blog: "博客",
    backHome: "返回首页",
    github: "GitHub",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    language: "语言",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "共享模型 API 网络",
    subtitle:
      "使用一个平台 API Key 直接调用在线共享模型，无需安装 CLI 或先贡献资源。",
    quickStart: "快速开始",
    quickStartHint: "创建平台 API Key，把工具指向 https://api.clovapi.com/v1。",
    useCaseAlt: "clovapi 桌面端展示 provider profiles、代理状态和请求日志",
    copy: "复制",
    copySuccess: "命令已复制到剪贴板",
    copyFailed: "复制失败",
    apiStyles: "兼容主流 API 风格",
    apiStylesSubtitle: "客户端按熟悉的格式发起请求，clovapi 负责在本地完成协议适配。",
    featuresTitle: "共享、统一、开箱即用",
    featuresSubtitle:
      "直接使用在线模型；有可共享资源时，再运行贡献节点增加供给。",
    features: {
      profiles: {
        title: "本地管理",
        description: "订阅登录态、上游地址、密钥和模型配置都保存在本机。",
      },
      switch: {
        title: "统一入口",
        description: "用稳定的本地 URL 访问 Codex、Claude、自定义 API 或 Ollama。",
      },
      subscription: {
        title: "订阅接入",
        description: "把 Codex、Claude 等官方订阅接入到本地模型 API 流程里。",
      },
      multiCli: {
        title: "请求可观测",
        description: "查看入站请求、上游响应片段、token 用量和系统事件。",
      },
      apiStyle: {
        title: "协议转换",
        description: "适配 Chat Completions、Responses、Messages 和 Gemini 请求格式。",
      },
      opensource: {
        title: "多种使用方式",
        description: "可使用 Go core、npm launcher，也可通过 Electron 桌面端管理。",
      },
    },
    downloadMac: "下载 macOS 版",
    downloadWindows: "下载 Windows 版",
    ctaTitle: "用一个 API Key 连接共享模型",
    ctaSubtitle:
      "从在线模型目录选择模型，通过统一的兼容接口接入应用和 Agent。",
    ctaGithub: "查看 GitHub",
    apiStyleItems: {
      chatCompletions: {
        title: "OpenAI Chat Completions",
        description: "为仍使用经典 OpenAI chat API 的客户端提供 /v1/chat/completions。",
      },
      anthropicMessages: {
        title: "Anthropic Messages",
        description: "接收 /v1/messages 风格请求，并转换到你配置的上游 provider。",
      },
      openaiResponses: {
        title: "OpenAI Responses",
        description: "支持现代 OpenAI 兼容客户端使用的 /v1/responses。",
      },
      gemini: {
        title: "Gemini",
        description: "把 Gemini 兼容的 generateContent 请求纳入同一套 provider profile 模型。",
      },
    },
    footerTagline: "共享模型 API 网络",
    footerCopyright: "(c) 2026 clovapi",
  },
  skill: {
    title: "clovapi Skill",
    subtitle: "给 AI 助手使用的简短说明，帮助它发现、调用和贡献 clovapi 共享模型。",
    promptLabel: "提示词",
    prompt: "请阅读并使用这个 clovapi skill：{{url}}",
    copy: "复制",
    copied: "已复制",
    copyFailed: "复制失败",
  },
  blog: {
    indexTitle: "博客",
    indexSubtitle: "教程和博客都在这里：共享模型调用、贡献节点、协议转换和调用调试。",
    guideLabel: "教程",
    blogLabel: "博客",
    backToBlog: "返回博客",
    viewSkill: "查看 Skill",
  },
} as const;

export default zhCN;
