# clovapi

clovapi is a shared model API network. Create one platform API key to discover and call models that are currently online through a unified OpenAI-compatible API. Consumers do not need to install the CLI, configure an upstream, or contribute capacity first.

Users with authorized model resources can run the clovapi CLI as a contribution node. Upstream URLs and credentials remain on the node; the platform receives available model IDs and relays requests and streaming responses over the node's outbound connection.

Agent CLI configuration switching and management now live in [clovagent](https://github.com/joohw/clovagent).

## Features

- One platform API key for online shared models.
- Model discovery through `/v1/models` and calls through `/v1/chat/completions` or `/v1/responses`.
- Direct consumer access without contributing a resource first.
- Contribution nodes with automatic model sync, daily limits, pause, and disconnect controls.
- Node-side OpenAI, Anthropic, and Gemini protocol adaptation without uploading upstream credentials.

## Quick Start

```bash
curl https://api.clovapi.com/v1/models \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY"
```

```bash
curl https://api.clovapi.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_FROM_LIST","messages":[{"role":"user","content":"Hello"}]}'
```

To contribute a model resource you are authorized to share:

```bash
npm i -g @clovapi/cli
clovapi share start --key YOUR_CLI_CONNECTION_KEY
```

The local proxy remains available as the contribution node's execution and protocol bridge and as an advanced standalone mode.

## Layout

| Directory | Role |
| --- | --- |
| `core/` | Go CLI, contribution-node runtime, protocol bridge, and relay core |
| `npm/` | npm launcher package (`@clovapi/cli`) |
| `web/` | React + Vite browser management UI |
| `landing/` | clovapi.com site on Workers Static Assets |
| `platform/` | Cloudflare Worker platform API, D1 control plane, and Durable Object relay |

The platform no longer requires a VPS in the target architecture. See the
[Cloudflare migration plan](docs/cloudflare-migration.md) for the service split,
state ownership and cutover verification checklist.

## Development

Run `npm ci --prefix web` and `npm run dev` at the repository root, then open http://127.0.0.1:31873. Run `npm run check:web` to check the UI. See [web/README.md](web/README.md) for lifecycle and build details.

```bash
cd core
go test ./...
```

Run the Cloudflare target independently with `npm ci --prefix platform`,
`npm run check:platform`, and `npm run dev:platform`. Use `dev` for ongoing work;
merging and pushing to `main` triggers Cloudflare Workers Builds to deploy both
production Workers. Non-production builds are disabled, so `dev` does not
create a preview deployment. There is no GitHub Actions deployment, manual
approval gate, or repository `CLOUDFLARE_API_TOKEN`. The Platform release
validates configuration, applies D1 migrations, and deploys the Worker; the
Landing release builds with the production API origin and deploys static assets
onto Worker Routes over the existing DNS records. Runtime secrets remain only
in Cloudflare. Direct Wrangler deployment remains available for rollback. The
former VPS deployment remains only as `npm run deploy:legacy-vps` during the
rollback window.
