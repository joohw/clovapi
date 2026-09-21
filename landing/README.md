# CLOVAPI Web App

Next.js presentation layer for the clovapi shared model API network. It is a
fully static export deployed through Cloudflare Workers Static Assets. Platform
state and business APIs live in the independent Platform Worker; this package
does not own accounts, credentials, admission, node connections, or the `/v1`
consumer API.

## Product routes

- `/zh-CN` and `/en`: landing page.
- `/zh-CN/docs` and `/en/docs`: Fumadocs documentation and local search.
- `/zh-CN/models` and `/en/models`: model catalog loaded from the Platform Worker.
- `/zh-CN/console` and `/en/console`: browser UI for Platform Worker authentication,
  API keys, contribution nodes, and credits.
- `/api/docs-search`: build-time Fumadocs search index used by client-side
  search.
- `/api/skill-md` and `/skill.md`: build-time Markdown assets. They do not read
  or mutate platform state.

The browser calls `NEXT_PUBLIC_CLOVAPI_API_URL` directly with credentialed CORS.
Production should use `https://api.clovapi.com`; local development typically
uses `http://127.0.0.1:8787`.

## Development

Start the Platform Worker first, then start Next.js:

```bash
cd landing
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_CLOVAPI_API_URL=http://127.0.0.1:8787` in `.env.local`, and
allow `http://127.0.0.1:3000` through the Platform Worker's CORS configuration.
Email, database, and relay secrets belong to the Platform Worker, not this
static site.

## Cloudflare Workers

Build and inspect the static output locally:

```bash
npm run build
npm run preview
```

Validate the deployment bundle without changing Cloudflare:

```bash
npm run deploy:dry-run
```

Cloudflare Workers Builds runs `npm run build:cloudflare` and `npm run deploy`
on each push to `main`. `dev` is the development branch; non-production builds
are disabled, so it does not deploy or create a preview. For an exceptional
manual release or rollback with the authenticated Wrangler CLI, in PowerShell:

```powershell
$env:NEXT_PUBLIC_CLOVAPI_API_URL = 'https://api.clovapi.com'
npm run release:manual
Remove-Item Env:NEXT_PUBLIC_CLOVAPI_API_URL
```

The production API origin is mandatory because it is compiled into the static
browser bundle. `release:manual` validates the cross-Worker configuration,
lints, builds, and then invokes the locked Wrangler version.

`wrangler.jsonc` binds `clovapi.com/*` and `www.clovapi.com/*` as Worker Routes
over the existing proxied DNS records, with `workers.dev` disabled. There is no
GitHub Actions deployment, preview environment, or manual approval gate, and no
Cloudflare API token or account ID is stored in GitHub Secrets, `.env`, or this
repository. Cloudflare Workers Builds keeps its build credential in Cloudflare.

Redirects and response headers live in `public/_redirects` and
`public/_headers`. Two query-only compatibility aliases from the old Next.js
middleware are intentionally not retained by the pure-static deployment:

- Use `/en/...` or `/zh-CN/...` instead of `?lang=en` / `?lang=zh-CN`.
- Use `/skill.md` instead of `/skill?format=md`.

## Container rollback

The legacy container path remains as a static Nginx rollback target. Build it
from the repository root:

```bash
docker build -f landing/Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_CLOVAPI_API_URL=https://api.clovapi.com \
  -t clovapi-web .
```

The image contains only the generated static assets; it does not run a Next.js
server.
