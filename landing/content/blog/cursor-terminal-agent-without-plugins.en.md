---
title: Use agents in Cursor without installing another plugin
description: Popular threads say terminal + BASE_URL is enough; clovapi switch persists config better than hand-written env.
date: 2026-05-31
---

A post that keeps circulating on DEV and Reddit-style communities makes a simple claim: **the shortcut to agents in Cursor is not an extension—it is the terminal plus environment variables.** Claude Code honors `ANTHROPIC_BASE_URL`; Codex has its own config; export once in Cursor’s integrated terminal and traffic hits your localhost proxy.

Follow-up comments complain: “env dies when I close the tab,” “every repo needs another export,” “Codex does not read Anthropic vars.”

## What the community gets right

- IDE plugins are optional; the **network path** is the integration surface.
- A local reverse proxy can transcode transparently—Cursor stays unaware.
- Running `claude` inside the IDE terminal feels the same as outside.

## Where env-vars break down

Typical failures:

1. New terminal tab without export—proxy “suddenly broken.”
2. Team docs say “set BASE_URL to xxx”—new hires still fail (port/path drift).
3. Claude Code and Codex together—different variable names, growing shell scripts.

## clovapi: turn the BASE_URL trick into config files

`switch` writes what each CLI already respects:

- Claude Code → `~/.claude/settings.json`, etc.;
- Codex → `~/.codex/config.toml`;
- OpenCode → global `opencode.jsonc`.

It starts the same **Go proxy** the CLI uses (default `http://127.0.0.1:27483`). In Cursor’s terminal:

```bash
clovapi switch --cli claude-code my-profile
claude
```

No per-session `export ANTHROPIC_BASE_URL=...` unless you want an override. New tabs, Cursor restarts—profile unchanged, wiring persists.

## Versus three-line launcher scripts

Communities share wrappers like:

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8077
exec claude "$@"
```

Fine for one proxy and one CLI. clovapi fits when you need:

- Many profiles (official / DeepSeek / team gateway);
- Many CLIs (Claude + Codex + OpenCode);
- GUI switching in the desktop app.

## Checklist for Cursor users

1. Install clovapi CLI or desktop (home page download).
2. `clovapi add` to save upstreams, `switch` per CLI.
3. Open Cursor’s terminal, run `claude` / `codex` / `opencode`.
4. Confirm proxy: `clovapi proxy status` or the desktop panel.

## Read more

- [How the local proxy works](/blog/local-proxy-for-agent-cli)
- [Stop proxy sprawl](/blog/stop-diy-proxy-sprawl-for-agent-cli)
- [Claude Code third-party API](/guides/claude-code-third-party-api)
