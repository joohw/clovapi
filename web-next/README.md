# CLOVAPI Next Frontend

Next.js App Router (Node SSR) frontend for CLOVAPI.

## Development

```bash
bun install
bun run dev
```

Default dev URL: `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SERVER_URL`: API base URL (e.g. `http://localhost:3000`)
- `PUBLIC_SITE_URL`: public website URL for canonical/sitemap/llms

## Build & Run

```bash
bun run build
bun run start
```

For integration with Go backend in this repository, set `FRONTEND_BASE_URL` on the Go service to point to this Next server.
