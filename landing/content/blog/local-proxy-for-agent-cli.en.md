---
title: Why coding agent CLIs need a local proxy
description: clovapi is built around a local proxy — agents talk to localhost while clovapi routes upstream and transcodes anthropic / openai-responses API formats.
date: 2026-05-20
---

Claude Code, Codex, OpenCode, and other coding agent CLIs are not designed to talk to arbitrary third-party APIs out of the box. Each CLI expects a specific upstream format: Claude Code uses Anthropic Messages, Codex uses OpenAI Responses, OpenCode often uses Chat Completions. When you want DeepSeek, OpenRouter, or a self-hosted gateway, the blocker is usually **API format mismatch**, not missing API keys.

## Limits of manual env vars

The common workaround is setting `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, and hoping the upstream is compatible. That breaks down quickly:

- Every CLI uses different env names and config paths — switching is tedious.
- Third-party compatibility layers vary; Claude Code is strict about Messages API details.
- Multiple profiles (official subscription + several third-party providers) are hard to swap without leaving stale config behind.

## clovapi's local proxy model

On `switch`, clovapi applies the selected profile to the target CLI and runs a **built-in local proxy**. The agent always calls `localhost`; the proxy handles:

1. **Upstream routing** — forwards to the Base URL and API Key you saved with `add`.
2. **API format transcoding** — picks anthropic, openai-responses, gemini, etc. per CLI automatically.
3. **Profile isolation** — save many upstreams with `clovapi add`, swap with one `clovapi switch`.

Agent-side config stays stable; you change clovapi profiles instead of editing each CLI by hand.

## Not a remote API gateway

Traditional gateways sit in your infrastructure and route service traffic. clovapi's proxy runs **on your machine**, next to where agent CLIs read config — optimized for developers switching coding-agent upstreams: lightweight, works offline, config in `~/.config/clovapi`.

## Next steps

- Browse [supported agents](/agents)
- Read the [Claude Code third-party API guide](/guides/claude-code-third-party-api)
- Install the CLI: `npm i -g @clovapi/cli`
