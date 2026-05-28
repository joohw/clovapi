# AGENTS.md — Project Conventions for clovapi 🍀

## Overview

clovapi is an open-source **Agent CLI profile switcher** with a **built-in local HTTP proxy**. It saves upstream API profiles (base URL, key, `api_style`, model) and applies them to Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, and related tools. After `switch`, agents talk to `localhost`; the Go proxy routes upstream and transcodes API formats (anthropic / openai-responses / gemini).

This repository does **not** ship a remote multi-tenant API gateway — no billing, rate limiting, or admin dashboard server.

## Repository layout

| Directory | Role |
|-----------|------|
| `core/` | Go CLI + local proxy core (`cmd/clovapi`, `internal/proxy`, `internal/apply`, `internal/protocol`) |
| `npm/` | npm launcher package (`@clovapi/cli`) that installs/calls the core binary |
| `electron/` | Desktop app (Electron + Svelte 5 UI); invokes the same Go binary for proxy/switch |
| `landing/` | Marketing site [clovapi.com](https://clovapi.com) (Next.js) |
| `docs/` | Harbor / agent reference notes |

## Tech stack

- **CLI / proxy**: Go 1.22+ (`core/`)
- **Desktop**: Electron, Svelte 5, Vite (`electron/ui/`)
- **Website**: Next.js (`landing/`)
- **Install**: `npm i -g @clovapi/cli` or desktop app; see `core/README.md` and `npm/README.md`

## Architecture (core)

```
clovapi add / switch → internal/apply (per-CLI config writers)
                    → Agent CLI → http://127.0.0.1:{port}/…/v1/…
                    → internal/proxy (ingress + protocol IR transcoding)
                    → upstream provider API
```

- **Profiles**: `~/.config/clovapi/profiles.json` (or `%APPDATA%\clovapi` on Windows)
- **Apply targets**: `core/internal/apply/target_*.go`
- **Protocol bridge**: `core/internal/protocol/` (request/response IR, SSE)
- **Proxy resolve**: `core/internal/proxyresolve/`

## Internationalization (i18n)

- **Desktop UI**: `electron/ui/src/lib/i18n/`
- **Landing site**: `landing/src/i18n/`

## Rules

### Rule 1: JSON in core

Core code uses standard `encoding/json`. There is no shared `common/json.go` wrapper in this repo.

### Rule 2: Frontend package managers

- **electron/** and **landing/**: follow each package’s README (`npm install`, `npm run dev`, etc.).
- **core/**: `go build`, `go test ./...` from `core/`.

### Rule 3: Hermes adapter tests — exercise the real `hermes` CLI

Hermes configuration and proxy ingress must be validated against **actual `hermes` subprocess HTTP calls**, not by asserting YAML fields or synthetic JSON bodies in isolation.

- **Do:** apply clovapi `Apply` output, run `hermes chat -q … -Q --accept-hooks --yolo --max-turns 1`, and assert the recorded request path/body (see `core/internal/apply/target_hermes_integration_test.go`).
- **Do:** treat [Hermes Agent transport rules](https://github.com/NousResearch/hermes-agent) as source of truth — e.g. `anthropic_messages` clients append `/v1/messages`, so clovapi must **not** suffix `/v1` on Anthropic-style custom provider base URLs.
- **Don't:** add Hermes tests that only read `~/.hermes/config.yaml` or mock request matrices without invoking the CLI.

When Hermes behavior is unclear, inspect the installed agent (`hermes dump`, `~/.hermes/hermes-agent/hermes_cli/runtime_provider.py`) before changing ingress style or base URL shaping.

### Rule 4: Dev core version must advance on local changes

The core dev build version lives in `core/internal/buildinfo/buildinfo.go` as a `devX.Y.Z` string (for example `dev2.1.1`). Whenever local development changes modify code or behavior, increment this dev core version in the same change. The desktop proxy health endpoint and `clovapi version` use this value, so bumping it makes stale local proxy binaries easier to detect.
