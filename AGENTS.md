# AGENTS.md - Project Conventions for clovapi

## Overview

clovapi is an open-source local API proxy. It saves upstream provider profiles (base URL, key, `api_style`, model), runs a local HTTP proxy, routes requests by provider id, and transcodes API formats.

This repository does not own local tool configuration management. That surface lives outside clovapi.

## Repository Layout

| Directory | Role |
| --- | --- |
| `core/` | Go CLI + local proxy core (`cmd`, `internal/proxy`, `internal/protocol`) |
| `npm/` | npm launcher package (`@clovapi/cli`) that installs/calls the core binary |
| `electron/` | Desktop app (Electron + Svelte 5 UI) for profiles, proxy status, and logs |
| `landing/` | Marketing site |

## Tech Stack

- CLI / proxy: Go 1.22+ (`core/`)
- Desktop: Electron, Svelte 5, Vite (`electron/ui/`)
- Website: Next.js (`landing/`)

## Architecture

```text
client -> http://127.0.0.1:{port}/{providerId}/v1/...
       -> internal/proxy
       -> internal/protocol
       -> upstream provider API
```

- Profiles: `~/.config/clovapi/profiles.json` or `%APPDATA%\clovapi\profiles.json` on Windows
- Protocol bridge: `core/internal/protocol/`
- Proxy resolve: `core/internal/proxyresolve/`

## Rules

### JSON in core

Core code uses standard `encoding/json`. There is no shared `common/json.go` wrapper in this repo.

### Frontend package managers

- `electron/` and `landing/`: follow each package README.
- `core/`: use `go build` and `go test ./...` from `core/`.

### Dev core version must advance on local changes

The core dev build version lives in `core/internal/buildinfo/buildinfo.go` as a `devX.Y.Z` string. Whenever local development changes modify code or behavior, increment this dev core version in the same change.
