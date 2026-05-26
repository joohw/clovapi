---
title: Stop writing a new local proxy for every agent CLI
description: Community lists are full of Claude Code / Codex proxy repos; clovapi uses one built-in proxy and profiles across CLIs and API formats.
date: 2026-05-28
---

GitHub awesome lists and Reddit-adjacent threads now treat **“Claude Code proxies”** as their own genre: DeepClaude, claude-code-router, codex-claude-proxy, CLIProxyAPI—each with a default port and its own `config.json`, mostly solving the same problem.

Developers complain in the same places: “three proxies means five localhost services on boot,” “switching to Codex means a whole new env block.”

## Why the sprawl exists

Each agent CLI speaks one “official” protocol:

| CLI | Expected protocol |
|-----|-------------------|
| Claude Code | Anthropic Messages |
| Codex | OpenAI Responses |
| OpenCode | Multiple provider blocks |

Third-party gateways usually implement only one. Community projects therefore build an **Anthropic-shaped localhost server** so Claude Code thinks it is talking to the real API.

That fixes Claude Code—and nothing else. Move to Codex and you hunt for a **Responses-shaped** proxy on another port.

## clovapi: one proxy core, many formats

On `switch`, clovapi starts **one** Go proxy (default `127.0.0.1:27483`) and transcodes based on the target CLI config already on disk:

- Claude Code → Messages semantics.
- Codex → Responses semantics.
- OpenCode → provider-specific mapping.

Change upstreams in profiles (base URL, key)—**no** extra Node/Python proxy per CLI.

```bash
clovapi add --name deepseek
clovapi switch --cli claude-code deepseek
# same profiles.json
clovapi switch --cli codex openrouter-prod
```

## Versus “router” projects

Some routers (e.g. claude-code-router) shine at **per-request tiering**—send Opus/Sonnet/Haiku traffic to different cheap models. clovapi optimizes for:

- **Unified config across CLIs** (Claude, Codex, OpenCode, OpenClaw, Hermes, Kimi).
- **`switch` writes each CLI’s official config files**, not only env vars.
- **Desktop + CLI** sharing `profiles.json`.

If you only ever use Claude Code with exotic model routing, a router may still fit; if you rotate agents daily, one clovapi profile library is usually less ops.

## Quick audit: are you over-proxied?

- More than two localhost proxies “for agents” on startup?
- Different ports when you change CLIs?
- Codex and Claude Code cannot share the same upstream definition?

If yes, consider converging on clovapi and retiring duplicates.

## Read more

- [Local proxy architecture](/blog/local-proxy-for-agent-cli)
- [Post-OAuth-ban workflows](/blog/anthropic-oauth-ban-agent-workflow)
- [Desktop vs CLI](/blog/desktop-app-vs-cli-workflow)
