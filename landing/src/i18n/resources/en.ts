const en = {
  header: {
    home: "Home",
    agents: "Agents",
    guides: "Guides",
    skill: "Skill",
    backHome: "Back to home",
    github: "GitHub",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    language: "Language",
    switchToZh: "切换为中文",
    switchToEn: "Switch to English",
  },
  home: {
    title: "Manage agent APIs with ease",
    subtitle:
      "Built around a local proxy: after switch, agent requests go through localhost while clovapi routes upstream and transcodes API formats.",
    quickStart: "Quick start",
    quickStartHint:
      "The added API profile is served to your target Agent CLI via the local proxy",
    useCaseAlt: "ClovAPI Switcher desktop app managing API upstreams for Claude Code, Codex, and other agents",
    copy: "Copy",
    copySuccess: "Commands copied to clipboard",
    copyFailed: "Copy failed",
    apiStyles: "Deep support for four API formats",
    apiStylesSubtitle: "At switch time, clovapi picks the best upstream API style for each CLI — no manual style matrix.",
    featuresTitle: "What the CLI does",
    featuresSubtitle: "Manage official subscriptions and third-party APIs in one place — switch upstreams for Claude Code, Codex, and more.",
    features: {
      profiles: {
        title: "clovapi add",
        description: "Save upstream profiles (official subscriptions or third-party APIs) with a connectivity probe before persist.",
      },
      switch: {
        title: "clovapi switch",
        description: "Apply a profile to a target CLI. Interactive picker or --cli for Claude Code, Codex, and others.",
      },
      subscription: {
        title: "Official subscriptions",
        description: "Supports Claude Code and Codex official subscription upstreams, switchable just like third-party API profiles.",
      },
      multiCli: {
        title: "Multi-CLI support",
        description: "Works with Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, and more.",
      },
      apiStyle: {
        title: "Automatic API-style mapping",
        description: "Matches anthropic, openai-responses, gemini, and other upstream formats per CLI at switch time.",
      },
      opensource: {
        title: "Open source & cross-platform",
        description: "Written in Go. Install via npm, Homebrew, or winget. Config lives in ~/.config/clovapi.",
      },
    },
    downloadMac: "Download for macOS",
    downloadWindows: "Download for Windows",
    installAgentSkill: "Install Agent Skill",
    ctaTitle: "Multiple ways to use clovapi",
    ctaSubtitle: "Manage agent APIs in a GUI — or install the CLI for one-line switching.",
    ctaGithub: "View on GitHub",
    apiStyleItems: {
      chatCompletions: {
        title: "openai-chat",
        description: "/v1/chat/completions · Chat Completions format, compatible with most OpenAI-style SDKs.",
      },
      anthropicMessages: {
        title: "anthropic",
        description: "/v1/messages · Anthropic Messages API, the native format for Claude Code and similar agents.",
      },
      openaiResponses: {
        title: "openai-responses",
        description: "/v1/responses · OpenAI Responses API, preferred by Codex and related agents.",
      },
      gemini: {
        title: "gemini",
        description: "GenerateContent · Google Gemini API for Gemini-based CLIs and toolchains.",
      },
    },
    footerTagline: "Built-in local proxy · Manage agent APIs with ease",
    footerCopyright: "© 2026 clovapi",
  },
  agents: {
    indexTitle: "Supported coding agents",
    indexSubtitle: "clovapi maps the right upstream API format per agent CLI — apply with one switch command.",
    pageTitle: "Manage {{name}} API upstream",
    pageSubtitle:
      "Save profiles with clovapi add, then apply with clovapi switch for {{name}} — official subscriptions or third-party APIs.",
    apiStyleTitle: "Automatic API format",
    apiStyleSubtitle: "When switching to {{name}}, clovapi picks the upstream protocol that CLI expects.",
    moreAgentsTitle: "Other supported agents",
    compareLink: "clovapi vs cc-switch →",
    guidesTitle: "Related guides",
  },
  guides: {
    indexTitle: "Setup guides",
    indexSubtitle: "Step-by-step: third-party APIs for Claude Code & Codex — DeepSeek, OpenRouter, SiliconFlow, and more.",
    tipsLabel: "Tip",
  },
  compare: {
    title: "clovapi vs cc-switch",
    subtitle:
      "Both offer desktop apps and multi-CLI support. clovapi is built around a local proxy that transcodes API formats via localhost at switch time.",
    feature: "Feature",
    yes: "Yes",
    no: "—",
    rows: {
      localProxyCore: "Built-in local proxy (core architecture)",
      multiCli: "Multi-CLI (Codex, OpenCode, etc.)",
      codex: "Codex official subscription",
      apiStyle: "Automatic API-format transcoding",
      claudeCode: "Claude Code config switching",
      openSource: "Open source",
      desktop: "Desktop app",
      mcpSkills: "MCP / Skills / Prompts sync",
    },
    whenClovapiTitle: "When to choose clovapi",
    whenClovapiBody:
      "You want switch to route through a built-in local proxy that transcodes anthropic / openai-responses / gemini in one place, or prefer a lightweight Go CLI with an optional desktop app.",
    whenCcSwitchTitle: "When to choose cc-switch",
    whenCcSwitchBody:
      "You need MCP/Skills/Prompts sync across CLIs, Gemini CLI support, or a fuller desktop ops panel (session search, cloud sync, optional proxy takeover).",
    agentsLink: "Browse supported agents →",
  },
  skill: {
    agentHintTitle: "Install ClovAPI Skill",
    agentHint: "Give the prompt below to your agent so it reads the skill document before acting.",
    agentPromptLabel: "Prompt",
    agentPrompt: "Visit {{url}} to learn the full Agent Skill document.",
    copy: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Copy failed",
  },
} as const;

export default en;
