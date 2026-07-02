# clovapi

clovapi is a local API proxy. It stores upstream provider/model profiles, runs a local HTTP proxy, routes requests by provider, and transcodes between OpenAI, Anthropic, and Gemini-compatible formats.

Agent CLI configuration switching and management now live in [clovagent](https://github.com/joohw/clovagent).

## Features

- Local profiles for base URL, API key, API style, and model.
- Local proxy, defaulting to `http://127.0.0.1:27483`.
- Provider routing via `/{providerId}/v1/...`.
- Protocol conversion for Anthropic Messages, OpenAI Chat Completions, OpenAI Responses, and Gemini.
- Desktop UI for profiles, proxy status, call logs, and system logs.

## Quick Start

```bash
cd core
go build ./cmd/clovapi
./clovapi proxy start
```

Common commands:

```bash
clovapi profiles load --json
clovapi profiles test --provider custom-api --model my-model --json
clovapi proxy status
clovapi proxy logs list
```

## Layout

| Directory | Role |
| --- | --- |
| `core/` | Go CLI and local proxy core |
| `npm/` | npm launcher package (`@clovapi/cli`) |
| `electron/` | Electron + Svelte desktop app |
| `landing/` | clovapi.com site |

## Development

```bash
cd core
go test ./...
```
