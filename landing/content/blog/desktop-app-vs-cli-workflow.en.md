---
title: Desktop app or CLI? Pick the right ClovAPI workflow
description: ClovAPI Switcher and the clovapi CLI share profiles.json—use the GUI for browsing and OAuth, the CLI for scripts and CI.
date: 2026-05-25
---

clovapi ships two surfaces: the **terminal CLI** (`npm i -g @clovapi/cli`) and **ClovAPI Switcher** for macOS and Windows. They are not separate products—two UIs over the same Go core and config files.

## One config file

Desktop and CLI both read and write:

- macOS / Linux: `~/.config/clovapi/profiles.json`
- Windows: `%APPDATA%\clovapi\profiles.json`

Profiles you save in the app appear in `clovapi list`; a `switch` in the terminal updates what the desktop **Apply** button reflects. The built-in local proxy is the same `clovapi proxy` daemon either way.

## When the desktop app helps

- **First-time setup**: pick a CLI, bind official subscriptions (Claude / Codex OAuth), run connectivity tests.
- **Many profiles**: browse the list, edit vendor models, inspect proxy call logs and system logs.
- **Prefer GUI over shell**: apply upstreams without memorizing paths or env vars.

Download macOS / Windows builds from the home page—the installer bundles the `clovapi` binary so you can start without a separate CLI install.

## When the CLI wins

- **Automation**: `clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>` in CI, devcontainers, or remote SSH hosts.
- **Speed**: if you already know profile names, one command beats opening a window.
- **Terminal-native flow**: fits tmux, Makefiles, and `clovapi update` for self-updates.

Install:

```bash
npm i -g @clovapi/cli
clovapi add --name prod
clovapi switch --cli claude-code --vendor "Custom API" --model <model-id>
```

## Mixing both is fine

A common pattern: finish OAuth and the first `add` in the desktop app, then `switch` from the terminal day to day—or CLI-only on servers and the GUI on a laptop for logs. Just avoid unsaved concurrent edits to the same profile in two places at once.

## Read more

- [Codex subscription as a local API](/blog/codex-subscription-to-local-api)
- [Managing multiple profiles](/blog/manage-multiple-api-profiles)
- [Supported agents](/agents)
