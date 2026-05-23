# CLOVAPI Landing

Next.js App Router marketing site for clovapi (CLI / desktop client).

## Development

```bash
bun install
bun run dev
```

Default dev URL: `http://localhost:27483`.

## Environment Variables

Copy the repo root `.env.example` to `.env.local`:

```bash
cp ../.env.example .env.local
```

- `PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_URL`: public website URL for canonical/sitemap/skill links
- `NEXT_PUBLIC_GITHUB_URL`: GitHub repo link (optional)
- `NEXT_PUBLIC_DESKTOP_DOWNLOAD_*`: desktop client download URLs (optional)

## Build & Run

```bash
bun run build
bun run start
```
