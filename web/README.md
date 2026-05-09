# CLOVAPI Next Frontend

Next.js App Router (Node SSR) frontend for CLOVAPI.

## Development

`next.config.ts` rewrites `/api` and `/v1` to the Go backend on **127.0.0.1:3000**. Start **Go first**, then this app, or use `..\scripts\dev.ps1` from the repo root on Windows.

```bash
bun install
bun run dev
```

Default dev URL: `http://localhost:3001` (Go API stays on `http://localhost:3000`).  
`bun run dev` uses **webpack** (`--webpack`) for more stable Windows dev; if you see odd Turbopack errors, delete `web/.next` and retry.

If you see `ECONNREFUSED 127.0.0.1:3000`, the Go process is not listening — run `go run .` in `backend/` (or use `scripts/dev.ps1`).

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
