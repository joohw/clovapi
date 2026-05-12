const en = {
  header: {
    home: "Home",
    docs: "Docs",
    models: "Models",
    agents: "Agents",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    pageTitle: "Switch {{client}} to any upstream · {{siteName}}",
    title: "Open Source API Switcher",
    subtitle:
      "Keep one integration for Claude Code, Codex, OpenCode, and more agent CLIs. clovapi routes requests across providers for failover and flexible traffic steering.",
    tagline: "Agent-first · High-performance API",
    installCommand: "Install command",
    copyInstallCommand: "Copy {{label}} install command",
    copySuccess: "Install command copied to clipboard",
    copyFailed: "Copy failed",
    tutorial: "View tutorial",
    apiStyles: "Compatible with 4 API styles",
    originalDocs: {
      chatCompletions: "Original docs: /v1/chat/completions",
      anthropicMessages: "Original docs: /v1/messages",
      openaiResponses: "Original docs: /v1/responses",
      gemini: "Original docs: Gemini GenerateContent",
    },
    openInNewTab: 'Open "{{label}}" (new tab)',
    openDoc: 'Open "{{label}}"',
    providersTitle: "Multiple providers, one switch",
    providersSubtitle:
      "Use one SDK / CLI / Agent setup, then map channels in the gateway as needed. It is like switching providers in an IDE, but handled at the gateway layer.",
    footerCopyright: "© 2026 CLOVAPI",
  },
} as const;

export default en;
