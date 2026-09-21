# AGENTS.md - Project Conventions for clovapi

## Overview

clovapi is a shared model API network. Consumers use one platform API key to discover and call models supplied by online contribution nodes and platform capacity. Consumers do not need to install the CLI or contribute a resource first.

The open-source CLI is the contribution-node runtime. It keeps upstream provider profiles and credentials on the node, advertises available model IDs, executes relayed requests, and transcodes API formats. Its standalone local proxy is an advanced capability, not the product's primary identity.

This repository does not own local tool configuration management. That surface lives outside clovapi.

## Repository Layout

| Directory | Role |
| --- | --- |
| `core/` | Go CLI, contribution-node runtime, protocol bridge, and relay core |
| `npm/` | npm launcher package (`@clovapi/cli`) that installs/calls the core binary |
| `web/` | Browser management UI (React + Vite), embedded and served by Go |
| `landing/` | Static-exported Next.js documentation, console, and marketing site |
| `platform/` | Cloudflare Worker platform API, D1 control plane, and Durable Object relay |

## Tech Stack

- CLI / contribution node / relay: Go 1.22+ (`core/`)
- Browser UI: React, Vite (`web/`); Go management server (`core/internal/webadmin/`)
- Website: Next.js static export on Workers Static Assets (`landing/`)
- Platform API: TypeScript, Cloudflare Workers, D1, and Durable Objects (`platform/`)

## Architecture

```text
consumer -> Platform Worker /v1 -> Relay Object -> contribution node -> upstream provider
                              -> platform supply

Web App Worker -> Platform Worker /api

advanced local client -> local proxy -> protocol bridge -> configured upstream
```

- Profiles: `~/.config/clovapi/profiles.json` or `%APPDATA%\clovapi\profiles.json` on Windows
- Consumer/control plane: `platform/`
- Persistent node transport: `platform/` and `core/internal/sharing/`
- Protocol bridge: `core/internal/protocol/`
- Proxy resolve: `core/internal/proxyresolve/`

## Rules

### Branches and production releases

- `dev` is the integration branch; `main` is the only production deployment branch.
- Cloudflare Workers Builds deploys `platform/` and `landing/` on pushes to `main`. Non-production branch builds and preview deployments are disabled.
- Do not run the production Wrangler deploy commands from `dev`: both configs bind production domains and the production D1 database.
- Keep Cloudflare build credentials in Cloudflare, not GitHub Actions or repository files.

### JSON in core

Core code uses standard `encoding/json`. There is no shared `common/json.go` wrapper in this repo.

### Frontend package managers

- `web/` and `landing/`: follow each package README.
- Build distributables with `npm run build` from the repository root (Vite assets before Go embedding).
- `core/`: use `go build` and `go test ./...` from `core/`.

### Landing page design principles

- Marketing pages do not use eyebrow text, overlines, or decorative section numbers above headings. Lead with the heading itself.
- Use a black, white, and gray palette for marketing pages and their illustrations. Do not introduce chromatic accent colors as decoration.
- Give Chinese and English copy comfortable letter spacing and line height, especially in the hero and section introductions.

### Dev core version must advance on local changes

The core dev build version lives in `core/internal/buildinfo/buildinfo.go` as a `devX.Y.Z` string. Whenever local development changes modify code or behavior, increment this dev core version in the same change.
