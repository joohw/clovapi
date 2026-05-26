---
title: After Anthropic blocked third-party OAuth, how should agent users wire APIs?
description: Lessons from high-engagement r/ClaudeAI threads: official CLI, API keys, switching to OpenCode/Codex, and managing upstreams legally with clovapi.
date: 2026-05-27
---

In early 2026 Anthropic tightened abuse of Claude subscription OAuth in third-party tools. Threads on r/ClaudeAI and adjacent communities hit thousands of upvotes. Common reactions: “my OpenClaw setup broke overnight,” “should I cancel the $200/mo Max plan?” Once the heat cooled, a few **durable** patterns kept showing up.

## Three recurring needs in those discussions

1. **Still want Claude subscription quota**, without sketchy OAuth forwarding.
2. **Happy to pay API usage**, but need third-party agents on stable Anthropic Messages access.
3. **Switch models or CLIs entirely**—OpenCode, Codex, DeepSeek—as long as the workflow survives.

clovapi targets (2) and (3) as the configuration layer: it does not bypass OAuth rules; it organizes **credentials you already obtained legally** (official OAuth flows, API keys, gateways) into profiles and applies them per CLI with `switch`.

## Path A: official Claude Code + local profiles

Anthropic’s supported path remains **Claude Code CLI** with subscription or API billing. The ClovAPI Switcher desktop app can complete Claude / Codex OAuth and write into the same `profiles.json` the CLI uses.

Good when you accept the official client experience but want fast switches to a team gateway or third-party API.

```bash
clovapi switch --cli claude-code my-team-gateway
```

## Path B: API keys into OpenCode and other CLIs

Many posts pointed people at OpenCode—75+ providers, local models, MIT license. After the ban, **API keys instead of subscription OAuth** is the compliance baseline.

clovapi writes OpenCode’s global `opencode.jsonc` and uses the local proxy for format transcoding ([OpenCode guide](/blog/switch-opencode-upstream-with-clovapi)).

## Path C: one profile library, different agent per day

Another meme in those threads: “Claude Code feels primitive; OpenCode is nicer; Codex patches better.” In practice people **change CLIs by task**, not once per career.

One `profiles.json` backs multiple agents:

```bash
clovapi list
clovapi switch --cli claude-code deepseek
clovapi switch --cli codex openrouter-prod
clovapi switch --cli opencode local-ollama
```

You change which upstream the active agent eats—not reinstall three env-var scripts.

## What not to keep doing

- Pumping Claude subscription OAuth tokens into unauthorized third-party shells (exactly what the ban targeted).
- Maintaining separate hand-written `export ANTHROPIC_*` scripts per CLI that never sync.
- Running eight single-purpose “Claude Code only” proxies on different ports ([next: proxy sprawl](/blog/stop-diy-proxy-sprawl-for-agent-cli)).

## Read more

- [Managing multiple profiles](/blog/manage-multiple-api-profiles)
- [clovapi vs cc-switch](/compare/cc-switch)
- [Claude Code third-party API](/guides/claude-code-third-party-api)
