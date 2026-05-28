---
title: Manage multiple agent APIs with profiles—not env var sprawl
description: Use clovapi add to save upstreams and switch per CLI; official subscriptions and third-party APIs live together in profiles.json.
date: 2026-05-24
---

Most developers juggle a **Claude Code subscription**, a **team Codex key**, a **DeepSeek fallback**, and an **OpenRouter trial model**. If each combination lives in shell `export` lines or hand-edited CLI configs, every switch means guessing which file you touched last.

## What a profile is

A **profile** in clovapi describes one upstream: base URL, credentials, default model, API style, and related fields. Everything sits in `~/.config/clovapi/profiles.json` (Windows: `%APPDATA%\clovapi\profiles.json`), decoupled from any single CLI.

Typical layout:

- `profiles`: every saved upstream.
- `active`: the profile name last applied to each CLI via `switch`.

So your DeepSeek settings are stored once—you might `switch --cli claude-code --vendor "Custom API" --model deepseek-chat` today and, when ready, point Codex at the same vendor/model binding if the upstream fits.

## Workflow: add once, switch per CLI

```bash
clovapi add --name deepseek
clovapi add --name openrouter-prod
clovapi add --name claude-official

clovapi switch --cli claude-code --vendor "Claude Subscription" --model claude-sonnet-4-20250514
clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>
```

`add` probes connectivity before persisting. `switch` touches **one** CLI at a time—you will not rewrite Codex when you only meant to change Claude Code.

Check state anytime:

```bash
clovapi list
```

## Resetting a single CLI

To return one agent to default wiring without clovapi relay, use interactive `clovapi switch` and pick **reset this CLI only**, or the documented reset flow. Handy for a quick return to stock behavior while keeping saved profiles.

## Desktop and CLI stay in sync

ClovAPI Switcher reads the same `profiles.json`. Profiles you add or test in the UI show up in `clovapi list` immediately, and vice versa. For teams, you can sync the file privately—never commit secrets.

## Read more

- [Why agent CLIs need a local proxy](/blog/local-proxy-for-agent-cli)
- [Switch Claude Code without env vars](/blog/switch-claude-code-api-without-env-vars)
- [All setup guides](/guides)
