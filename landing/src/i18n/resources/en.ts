const en = {
  header: {
    home: "Home",
    skill: "Skill",
    blog: "Articles",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "Switch to Chinese",
    switchToEn: "Switch to English",
  },
  home: {
    title: "Local proxy and subscription conversion",
    subtitle:
      "clovapi does two things: it runs a local HTTP proxy and converts official subscriptions or custom upstreams into OpenAI, Anthropic, and Gemini-compatible endpoints.",
    quickStart: "Quick start",
    quickStartHint: "Start the proxy, then point tools at http://127.0.0.1:27483/{providerId}/v1/...",
    useCaseAlt: "clovapi desktop showing provider profiles, proxy status, and request logs",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    apiStyles: "API styles it converts",
    apiStylesSubtitle: "Use the request format your client expects while clovapi converts subscription or upstream responses locally.",
    featuresTitle: "Focused on local proxying and subscription conversion",
    featuresSubtitle:
      "A small Go proxy core, an npm launcher, and an optional desktop app for subscription login, upstream settings, proxy status, and logs.",
    features: {
      profiles: {
        title: "Local configuration",
        description: "Keep subscriptions, base URLs, API keys, API styles, and model names on your machine.",
      },
      switch: {
        title: "Stable local endpoints",
        description: "Call paths like /codex/v1/responses or /custom-api/v1/chat/completions for different upstreams.",
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
    ctaTitle: "Route subscriptions and upstreams through localhost",
    ctaSubtitle:
      "Keep one local configuration and give every client a stable local URL instead of handing keys or subscription sessions to a hosted gateway.",
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
    footerTagline: "Local proxy and subscription conversion",
    footerCopyright: "(c) 2026 clovapi",
  },
  skill: {
    title: "clovapi Skill",
    subtitle: "A compact instruction page for AI assistants to understand clovapi local proxying, subscription access, and protocol conversion.",
    promptLabel: "Prompt",
    prompt: "Read and use this clovapi skill: {{url}}",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
  },
  blog: {
    indexTitle: "Articles",
    indexSubtitle: "Tutorials and posts on local proxying, subscription access, protocol conversion, and call debugging.",
    guideLabel: "Tutorial",
    blogLabel: "Blog",
    backToBlog: "Back to articles",
    viewSkill: "View Skill",
  },
} as const;

export default en;
