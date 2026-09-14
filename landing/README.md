# CLOVAPI Web App

Next.js presentation layer for the clovapi shared model API network. Platform
state and business APIs live in the independent Go
[Platform Backend](../backend/README.md); this package does not own accounts,
credentials, admission, node connections, or the `/v1` consumer API.

## Product routes

- `/zh-CN` and `/en`: landing page.
- `/zh-CN/docs` and `/en/docs`: Fumadocs documentation and local search.
- `/zh-CN/models` and `/en/models`: model catalog loaded from the Go Backend.
- `/zh-CN/console` and `/en/console`: browser UI for Backend authentication,
  API keys, contribution nodes, and credits.
- `/api/docs-search` and `/api/skill-md`: content-only Next.js routes. They do
  not read or mutate platform state.

The browser calls `NEXT_PUBLIC_CLOVAPI_API_URL` directly with credentialed CORS.
Production should use `https://api.clovapi.com`; local development typically
uses `http://127.0.0.1:3100`.

## Development

Start the Backend first:

```bash
go run ./core/cmd/backend --listen 127.0.0.1:3100 --database ./landing/.data/clovapi.db
```

Then start Next.js:

```bash
cd landing
cp .env.example .env.local
npm install
npm run dev -- --port 3101
```

Set `NEXT_PUBLIC_CLOVAPI_API_URL=http://127.0.0.1:3100` in `.env.local`, and
allow `http://127.0.0.1:3101` through `CLOVAPI_ALLOWED_ORIGINS` on the Backend.
Email login credentials (`AUTH_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM`) are
Backend environment variables, not Next.js variables.

## Container

Build the frontend from the repository root:

```bash
docker build -f landing/Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_CLOVAPI_API_URL=https://api.clovapi.com \
  -t clovapi-web .
```

The image contains only Next.js. Deploy it separately from `backend/compose.yaml`.
The architectural boundary is recorded in
[ADR-0004](../docs/adr/0004-unified-go-platform-backend.md).
