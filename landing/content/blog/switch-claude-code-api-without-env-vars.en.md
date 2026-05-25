---
title: Switch Claude Code API upstream without editing env vars
description: Save profiles with clovapi add, apply with switch — route Claude Code through the local proxy to DeepSeek, OpenRouter, and other third-party APIs.
date: 2026-05-22
---

When wiring Claude Code to a third-party API for the first time, many developers start by searching how to change `ANTHROPIC_BASE_URL`. Env vars can work once, but they **do not scale** for daily use: multiple upstreams, mixing official subscriptions with third-party keys, and team workflows all make manual env management fragile.

## Recommended flow: add → switch

clovapi models upstreams as **profiles** with two commands:

```bash
npm i -g @clovapi/cli
clovapi add --name deepseek
clovapi switch --cli claude-code deepseek
```

`add` probes connectivity before saving; `switch` writes Claude Code config and routes traffic through the local proxy. The agent always talks to localhost — no need to memorize Anthropic env var combinations.

## Common upstreams

| Scenario | During `add` | After `switch` |
| --- | --- | --- |
| DeepSeek | Base URL, model ID (e.g. deepseek-chat) | Claude Code speaks Messages; proxy transcodes to DeepSeek |
| OpenRouter | OpenRouter key and model slug | Same, routed via proxy |
| Official Claude subscription | Official profile type | Switches like any third-party profile |

Step-by-step guides: [Claude Code + DeepSeek](/guides/claude-code-deepseek) and [OpenRouter](/guides/claude-code-openrouter).

## Multiple profiles

Keep `official`, `deepseek`, and `openrouter-prod` side by side. To swap upstreams:

```bash
clovapi switch --cli claude-code openrouter-prod
```

No Claude Code reinstall, no shell `export` cleanup, no accidental keys in dotfiles.

## clovapi vs cc-switch?

If you need MCP/Skills sync across CLIs or a heavier desktop ops panel, see [clovapi vs cc-switch](/compare/cc-switch). If you want a **light CLI + local proxy transcoding + fast switch**, clovapi fits daily agent development better.

## Try it

- [Claude Code agent page](/agents/claude-code)
- [All setup guides](/guides)
- Desktop app: download on the home page
