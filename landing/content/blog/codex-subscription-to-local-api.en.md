---
title: Turn your Codex subscription into a local API in one click
description: Save official Codex or third-party upstreams as clovapi profiles; after switch, the local proxy routes OpenAI Responses traffic to the real endpoint.
date: 2026-05-23
---

OpenAI Codex CLI expects the official Responses API by default. If you want to keep the Codex workflow while pointing traffic at a self-hosted gateway, team proxy, or shared profile library across agents, hand-editing `~/.codex/config.toml` often leaves half-finished config behind.

## Why Codex still needs a local proxy

Codex is tied to the **openai-responses** format, not generic Chat Completions. Many gateways only speak `/v1/chat/completions`; changing the base URL alone usually breaks on tool calls or streaming fields. When you run `switch --cli codex`, clovapi:

1. Merges Codex `config.toml` (provider, model, experimental bearer, and related keys).
2. Starts the built-in local proxy so Codex only talks to `localhost`.
3. Transcodes and forwards Responses-shaped requests to the profile you saved.

The agent keeps stable paths; switching upstream means switching a clovapi vendor/model binding.

## Suggested commands

```bash
npm i -g @clovapi/cli
clovapi add --name codex-official
clovapi switch --cli codex --vendor "Codex Subscription" --model gpt-5.5
```

`add` probes connectivity first. For a third-party gateway, enter base URL, API key, and model ID in the interactive flow. Official subscription and vendor APIs are distinguished by **vendor/model binding**:

```bash
clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>
```

## Share the profile library with Claude Code

`profiles.json` stores **upstreams**, not per-CLI silos. You might bind `Custom API/deepseek-chat` for Claude Code and `Custom API/<responses-model-id>` for Codex. The desktop app and CLI read the same file, so you can pick bindings in the GUI or automate them in the terminal.

## Read more

- [Codex agent page](/agents/codex)
- [Codex third-party API guide](/guides/codex-third-party-api)
- [Managing multiple profiles](/blog/manage-multiple-api-profiles)
