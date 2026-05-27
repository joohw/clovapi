# CLOVAPI Landing

Next.js App Router marketing site for clovapi (CLI / desktop client).

## Development

```bash
npm install
npm run dev
```

Default dev URL: `http://localhost:3000` (local Go proxy stays on `27483`).

## Environment Variables

All env files for this app live in `landing/`:

| File | Purpose |
|------|---------|
| `.env.example` | 可选运行时变量（R2 本地发布等）；站点 URL 等已硬编码 |
| `.env.deploy.example` | Deploy credentials template — copy to `.env.deploy` |

Local development:

```bash
cp .env.example .env.local
```

Deploy (from repo root; reads `landing/.env.deploy`; optional `landing/.env` for extra runtime vars):

```bash
cd ..
npm run deploy
```

Pushes to `main` that touch **`landing/**` only** trigger automated deploy via `.github/workflows/deploy-landing.yml` when these GitHub secrets are set:

- `DOCKER_REGISTRY`, `DOCKER_USERNAME`, `DOCKER_PASSWORD`
- `SSH_HOST`, `SSH_USERNAME`, `SSH_PASSWORD` (`SSH_PORT` defaults to `22`)

`core/` / CLI releases use `.github/workflows/release-switcher.yml` on `v*` tags — landing-only commits do not run that workflow.

Desktop shell releases use `.github/workflows/release-desktop.yml` on `electron/**` commits to `main`.

Manual deploy: run the **deploy-landing** workflow (optional `tag` input, default `latest`).

Hardcoded in code (`landing/src/lib/site.ts`, `landing/src/lib/downloads.ts`):

- Site URL: `https://clovapi.com`
- GitHub: `https://github.com/joohw/clovapi`
- Desktop downloads: `https://downloads.clovapi.com/desktop/latest/...`

## Build & Run

```bash
npm run build
npm run start
```
