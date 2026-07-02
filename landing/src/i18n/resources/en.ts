const en = {
  header: {
    home: "Home",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "Switch to Chinese",
    switchToEn: "Switch to English",
  },
  home: {
    title: "Local API proxy for model providers",
    subtitle:
      "Store provider profiles, run a local HTTP proxy, route by provider, and transcode OpenAI, Anthropic, and Gemini-compatible requests.",
    quickStart: "Quick start",
    quickStartHint: "The proxy listens locally and routes requests by provider id.",
    useCaseAlt: "ClovAPI desktop app showing local proxy profiles and logs",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    apiStyles: "Protocol formats",
    apiStylesSubtitle: "clovapi converts between common model API formats at the proxy boundary.",
    featuresTitle: "What clovapi does",
    featuresSubtitle: "A small local proxy core with profile storage, routing, protocol conversion, and logs.",
    features: {
      profiles: {
        title: "Profiles",
        description: "Save base URL, API key, API style, and model settings in one local profiles file.",
      },
      switch: {
        title: "Provider routing",
        description: "Route local requests through provider-scoped paths such as /custom-api/v1/responses.",
      },
      subscription: {
        title: "Local proxy",
        description: "Run a local HTTP service on 127.0.0.1:27483 by default.",
      },
      multiCli: {
        title: "Call logs",
        description: "Inspect inbound requests, upstream responses, token usage, and system logs.",
      },
      apiStyle: {
        title: "Protocol conversion",
        description: "Bridge Anthropic Messages, OpenAI Chat Completions, OpenAI Responses, and Gemini.",
      },
      opensource: {
        title: "Open source",
        description: "Go core, npm launcher, and optional Electron desktop app.",
      },
    },
    downloadMac: "Download for macOS",
    downloadWindows: "Download for Windows",
    ctaTitle: "Run it your way",
    ctaSubtitle: "Use the Go CLI, npm launcher, or desktop app against the same local profiles file.",
    ctaGithub: "View on GitHub",
    apiStyleItems: {
      chatCompletions: {
        title: "openai-chat",
        description: "/v1/chat/completions for OpenAI-compatible chat clients.",
      },
      anthropicMessages: {
        title: "anthropic",
        description: "/v1/messages for Anthropic Messages-compatible requests.",
      },
      openaiResponses: {
        title: "openai-responses",
        description: "/v1/responses for OpenAI Responses-compatible requests.",
      },
      gemini: {
        title: "gemini",
        description: "GenerateContent-compatible Gemini requests.",
      },
    },
    footerTagline: "Local API proxy for model providers",
    footerCopyright: "(c) 2026 clovapi",
  },
} as const;

export default en;
