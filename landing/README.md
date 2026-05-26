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
| `.env.example` | Runtime template — copy to `.env.local` (dev) or `.env` (deploy) |
| `.env.deploy.example` | Deploy credentials template — copy to `.env.deploy` |

Local development:

```bash
cp .env.example .env.local
```

Deploy (from repo root; reads `landing/.env.deploy` + `landing/.env`):

```bash
cd ..
npm run deploy
```

- `PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_URL`: public website URL for canonical/sitemap/skill links
- `NEXT_PUBLIC_GITHUB_URL`: GitHub repo link (optional)
- `NEXT_PUBLIC_DESKTOP_DOWNLOAD_*`: desktop client download URLs (optional)

## Build & Run

```bash
npm run build
npm run start
```
