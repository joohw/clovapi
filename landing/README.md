# CLOVAPI Next Frontend

Next.js App Router (Node SSR) frontend for CLOVAPI.

## Development

`next.config.ts` rewrites `/api` and `/v1` to the Go backend on **127.0.0.1:27482** by default. Start **Go first**, then this app, or from the repo root run **`npm run dev`** (starts Go then Next via `scripts/dev.mjs`).

```bash
bun install
bun run dev
```

Default dev URL: `http://localhost:27483` (Go API on `http://127.0.0.1:27482`).  
`bun run dev` uses **webpack** (`--webpack`) for more stable Windows dev; if you see odd Turbopack errors, delete `web/.next` and retry.

If you see `ECONNREFUSED 127.0.0.1:27482`, the Go process is not listening — run `npm run dev:api` from the repo root, or `go run . -port 27482` with cwd `backend/`.

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SERVER_URL`: API base URL (e.g. `http://localhost:27482`)
- `PUBLIC_SITE_URL`: public website URL for canonical/sitemap/llms

## Build & Run

```bash
bun run build
bun run start
```

For integration with Go backend in this repository, set `FRONTEND_BASE_URL` on the Go service to point to this Next server.
