const en = {
  header: {
    home: "Home",
    skill: "Skill",
    blog: "Blog",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "Switch to Chinese",
    switchToEn: "Switch to English",
  },
  home: {
    title: "A shared model API network",
    subtitle:
      "Call online shared models with one platform API key, without installing the CLI or contributing a resource first.",
    quickStart: "Quick start",
    quickStartHint: "Create a platform API key, then point tools at https://api.clovapi.com/v1.",
    useCaseAlt: "clovapi desktop showing provider profiles, proxy status, and request logs",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    apiStyles: "API styles it converts",
    apiStylesSubtitle: "Use the request format your client expects while clovapi converts subscription or upstream responses locally.",
    featuresTitle: "Shared, unified, and ready to call",
    featuresSubtitle:
      "Use online models directly. Run a contribution node only when you want to add authorized supply.",
    features: {
      profiles: {
        title: "Local configuration",
        description: "Keep subscriptions, base URLs, API keys, API styles, and model names on your machine.",
      },
      switch: {
        title: "Stable local endpoints",
        description: "Call paths like /codex/v1/responses or /custom/v1/chat/completions for different upstreams.",
      },
      subscription: {
        title: "Subscriptions to API",
        description: "Turn official Codex and Claude subscription sessions into model APIs callable through localhost.",
      },
      multiCli: {
        title: "Request visibility",
        description: "Inspect inbound requests, upstream responses, token usage, and system events from the desktop app.",
      },
      apiStyle: {
        title: "Protocol conversion",
        description: "Bridge OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, and Gemini-style requests.",
      },
      opensource: {
        title: "No hosted gateway",
        description: "Requests, keys, and subscription sessions stay local; use the Go core, npm launcher, or Electron desktop.",
      },
    },
    downloadMac: "Download for macOS",
    downloadWindows: "Download for Windows",
    ctaTitle: "Connect to shared models with one API key",
    ctaSubtitle:
      "Choose from the online model catalog and connect applications and agents through one compatible API.",
    ctaGithub: "View on GitHub",
    apiStyleItems: {
      chatCompletions: {
        title: "OpenAI Chat Completions",
        description: "Expose /v1/chat/completions for clients that expect the classic OpenAI chat API.",
      },
      anthropicMessages: {
        title: "Anthropic Messages",
        description: "Accept /v1/messages-style requests and translate them through the configured upstream.",
      },
      openaiResponses: {
        title: "OpenAI Responses",
        description: "Support /v1/responses for modern OpenAI-compatible clients.",
      },
      gemini: {
        title: "Gemini",
        description: "Route Gemini-compatible generateContent requests through the same provider profile model.",
      },
    },
    footerTagline: "Shared model API network",
    footerCopyright: "(c) 2026 clovapi",
  },
  skill: {
    title: "clovapi Skill",
    subtitle: "A compact guide for AI assistants to discover, call, and contribute models through clovapi.",
    promptLabel: "Prompt",
    prompt: "Read and use this clovapi skill: {{url}}",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
  },
  blog: {
    indexTitle: "Articles",
    indexSubtitle: "Tutorials and posts on shared-model calls, contribution nodes, protocol conversion, and debugging.",
    guideLabel: "Tutorial",
    blogLabel: "Blog",
    backToBlog: "Back to articles",
    viewSkill: "View Skill",
  },
} as const;

export default en;
