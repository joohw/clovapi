---
title: What Reddit keeps asking: routing Claude Code Opus / Sonnet / Haiku on a budget
description: Communities split main vs sub-agent traffic across cheap models; clovapi uses profiles and one local proxy instead of multi-port routers.
date: 2026-05-29
---

Posts like “run Claude Code on DeepSeek and cut the bill 90%” keep resurfacing on Reddit, Hacker News, and dev blogs. The technical hook is always the same: **Claude Code labels traffic as Opus (main loop), Sonnet, or Haiku (sub-agents / light steps)**—and Anthropic list prices hurt even on “small” Haiku calls.

That spawned free-claude-code, claude-code-router, and cousins that map each tier to OpenRouter free models, DeepSeek Flash, or local Ollama.

## What those community projects do

Configs often look like:

```
MODEL_OPUS=openrouter/qwen-...-free
MODEL_SONNET=deepseek/deepseek-chat
MODEL_HAIKU=ollama/llama3.1
```

The proxy inspects the model name on **every HTTP request** and picks a backend. Great for “Claude Code only,” but:

- Rules live inside the proxy repo—not shared with Codex or OpenCode.
- Changing vendors means editing proxy config, not `clovapi switch`.
- Several proxies running ⇒ tier rules drift apart.

## clovapi’s frugal pattern: switch profiles, don’t hack tiers

clovapi does not ship a hard-coded “Opus→free / Haiku→local” table (no hidden magic). A simpler loop:

1. **`clovapi add --name deepseek-flash`** — bind a cheap model and gateway.
2. **`clovapi switch --cli claude-code --vendor "Custom API" --model deepseek-chat`** — the whole Claude Code session uses that upstream; the proxy transcodes Messages format.
3. When you need Opus-grade quality, **`switch` back to an official profile** (desktop OAuth or Anthropic API profile).

Whether sub-agents get cheaper depends on whether that **single upstream** is fast enough end-to-end. Many reports say DeepSeek V4 Flash covering ~80% of daily coding already beats maintaining tier tables.

## When you still want a tier router

- You require “Opus quality on the main loop + nearly free sub-agents” inside one session.
- You already invested in claude-code-router `background` / `thinking` routes.

Point the router’s gateway URL at a **profile upstream** in `clovapi add` instead of running a second parallel proxy.

## Practical table (condensed from community consensus)

| Goal | Suggestion |
|------|------------|
| Slash cost | Default profile → DeepSeek or cheap OpenRouter |
| Critical refactor | Temporary `switch` to official Claude profile |
| Multiple CLIs | Unified clovapi profiles, not per-CLI env |
| Less ops | One local proxy port; retire duplicates |

## Read more

- [Switch Claude Code without env vars](/blog/switch-claude-code-api-without-env-vars)
- [Stop proxy sprawl](/blog/stop-diy-proxy-sprawl-for-agent-cli)
- [DeepSeek guide](/guides/claude-code-deepseek)
