---
title: Switch OpenCode upstream APIs with clovapi
description: OpenCode global config supports multiple API styles; clovapi switch writes the right provider block and transcodes via the local proxy.
date: 2026-05-26
---

[OpenCode](https://opencode.ai) loads models and providers from global config files whose paths vary by OS, with merge rules across `opencode.jsonc`, `opencode.json`, and `config.json`. Hand-editing JSON is easy to conflict with project-level overrides, and slow when you change upstreams often.

## What clovapi does for OpenCode

Running `clovapi switch --cli opencode <profile>` will:

1. Resolve OpenCode’s **global** config directory (Windows: `%AppData%\opencode\` first, else `~/.config/opencode/`).
2. Pick or create `opencode.jsonc` (or an existing `opencode.json` / `config.json`).
3. Write `provider` and top-level `model` for the profile’s API style (`anthropic/…`, `clovapi/…`, `gemini/…`, etc.).
4. Start the local proxy so OpenCode traffic goes through localhost.

If a switch “does nothing”, check for project-level `opencode.json` overrides or `OPENCODE_CONFIG` pointing elsewhere.

## Quick start

```bash
npm i -g @clovapi/cli
clovapi add --name my-gateway
clovapi switch --cli opencode my-gateway
```

During `add`, confirm the API style (Anthropic-compatible, OpenAI-compatible, Gemini, …). `switch` maps it into OpenCode’s provider layout. Keep multiple profiles and swap by name.

## Alongside other CLIs

OpenCode is one supported CLI among several:

```bash
clovapi switch --cli claude-code deepseek
clovapi switch --cli codex openrouter-prod
clovapi switch --cli opencode my-gateway
```

`clovapi list` shows the active profile per CLI and the API-style matrix.

## Read more

- [OpenCode agent page](/agents/opencode)
- [How the local proxy works](/blog/local-proxy-for-agent-cli)
- [Managing multiple profiles](/blog/manage-multiple-api-profiles)
