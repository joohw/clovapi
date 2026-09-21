# Cloudflare migration

## Outcome

clovapi can run without a platform VPS while retaining user-operated contribution nodes. The existing Go server is not copied into a Worker; its responsibilities are split by consistency boundary.

New Cloudflare projects should use Workers rather than creating a new Pages project. The web project still uses Cloudflare's static-asset edge delivery, but it is deployed with Workers Static Assets so the platform has one current deployment model.

```text
clovapi.com
  Web App Worker (Next.js static export + static assets)
             |
             | credentialed HTTPS
             v
api.clovapi.com
  Platform Worker
    +-- D1: accounts, credentials, node directory, audit
    +-- NodeSession Durable Object, one per contribution node
    +-- AccountGate Durable Object, one per account
    +-- AuthRateGate Durable Object, one per hashed email or client IP
    +-- Queue (later): terminal audit and aggregate usage
             ^
             | outbound WebSocket initiated by the CLI
             |
  contribution node -> contributor-owned upstream
```

## Service split

| Unit | Owns | Does not own |
| --- | --- | --- |
| Web App Worker | Marketing pages, docs, browser console, static search index | Sessions, platform writes, node sockets |
| Platform Worker | Public routing, authentication, API-key validation, D1 reads/writes, candidate selection | Upstream credentials, live node concurrency |
| `NodeSession` Durable Object | One node socket, model inventory, five slots, daily counter, relay protocol, backpressure and cancellation | Global account data, request or response bodies at rest |
| `AccountGate` Durable Object | One account's 20 in-flight slots, request bindings, revocation coordination | Node transport |
| `AuthRateGate` Durable Object | Atomic sliding-window claims for a keyed hash of one email address or client IP | Email content, account sessions, raw email/IP identifiers |
| D1 | Queryable control-plane records and terminal audit projections | WebSocket ownership or per-frame state |
| Contribution node | Upstream credentials, provider protocol adaptation, local limits and request execution | Platform accounts and consumer keys |

The first production version intentionally uses one public Platform Worker instead of several public microservices. Auth, control and relay ingress remain logical modules inside that Worker. Splitting those modules into separate deployments would add internal authentication and failure modes without creating a useful scaling boundary; Durable Objects already provide the required sharding.

## Data placement

There is no import from the old SQLite database. A fresh D1 database is created from the migrations in `platform/migrations`.

| Existing state | Target |
| --- | --- |
| Users, email challenges, sessions | D1 |
| Consumer and CLI connection keys | D1; only hashes and encrypted recoverable CLI keys are stored |
| Node ownership, name, limits and key metadata | D1 |
| Live connection, advertised models and availability | `NodeSession`; D1 contains only a query projection |
| Active relay job and stream buffers | `NodeSession` memory only; they fail rather than replay after an eviction/restart |
| Account-wide active request admissions | `AccountGate` SQLite storage, with alarms for expiry |
| Login-code rate claims | `AuthRateGate` SQLite storage, sharded by HMAC(email/IP) |
| Balances and ledger | D1 |
| Running/terminal request audit and model-minute aggregates | D1 metadata only, written directly initially and pruned by Cron; an idempotent Queue consumer may replace direct aggregate writes later |
| Request and response bodies | Streamed only; never persisted by the platform |

## Protocol compatibility

Relay protocol version 1 is retained. The endpoints and envelopes remain compatible:

- `POST /api/node/register`
- `GET /api/node/connect` with a WebSocket upgrade
- `GET /api/models`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`

The CLI connection key continues to embed the public platform origin. A node connects directly to that origin; authentication-bearing requests are never redirected to another domain.

The contribution CLI keeps its WebSocket control ping and reconnect loop. It sends application-level `state` only when models, pause state or remaining local capacity changes. This allows an idle `NodeSession` to hibernate while Cloudflare answers protocol ping/pong without waking application code.

## Failure and retry rules

- D1 candidate lookup is advisory. `NodeSession` performs the final atomic capacity check.
- The Platform Worker may try another candidate only after an explicit pre-dispatch rejection such as `model_unavailable`, `node_busy` or `node_limit_reached`.
- An uncertain dispatch is never sent to another node because the first upstream may already be executing it.
- Consumer cancellation propagates to the node and releases both node and account slots.
- A Durable Object restart marks previously active work failed and never replays it.
- Queue deliveries are at least once. Every audit and aggregate event uses the request ID as an idempotency key.

## Deployment configuration

The primary branches are `dev` for ongoing work and `main` for production.
Both Workers are connected to `joohw/clovapi` through Cloudflare Workers
Builds. A push to `main` runs the build and deploy commands below. Non-production
branch builds are disabled: pushing `dev` neither deploys these production
Workers nor creates a preview environment. Merge `dev` into `main` to release;
the production validator also rejects a Cloudflare build whose branch is not
`main`. There is no GitHub Actions deployment, manual approval gate, or
repository-level `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secret.

| Worker | Directory | Validate/build | Production deploy |
| --- | --- | --- | --- |
| `clovapi-platform` | `platform` | `npm run build:cloudflare` | `npm run deploy` (remote D1 migrations, then Wrangler deploy) |
| `clovapi-landing` | `landing` | `npm run build:cloudflare` | `npm run deploy` (Wrangler Static Assets deploy) |

Each Cloudflare Worker name must exactly match the `name` in its
`wrangler.jsonc`. Cloudflare builds the two Workers independently, so API and
schema changes must remain compatible while one Worker is ahead of the other.
Build Landing with
`NEXT_PUBLIC_CLOVAPI_API_URL=https://api.clovapi.com` in the build environment.
The production configuration disables `workers.dev`; Platform uses the
`api.clovapi.com` custom domain, while Landing uses Worker Routes on
`clovapi.com/*` and `www.clovapi.com/*` so the existing proxied DNS records do
not need to be replaced.

Platform runtime secrets are stored as encrypted Worker secrets and are never
committed:

- `AUTH_SECRET` (at least 32 random bytes)
- `RESEND_API_KEY`
- `RESEND_FROM`

On the first deployment, `deploy:bootstrap` reads those three values from an
explicit dotenv file, writes only those values to a mode-restricted temporary
JSON file, passes it to Wrangler's `--secrets-file`, and removes the temporary
file in a `finally` block. Subsequent `wrangler deploy` releases keep the
already configured secrets. Non-secret Platform variables include the public
API origin and an exact comma-separated browser-origin allowlist. Landing
embeds `NEXT_PUBLIC_CLOVAPI_API_URL=https://api.clovapi.com` in the static
browser bundle.

The public catalog uses one canonical Cache API key for `/api/models` and the authenticated `/v1/models` projection. A 60-second edge snapshot prevents anonymous catalog reads from turning into repeated D1 queries. Login-code issuance claims both email and IP `AuthRateGate` objects before writing D1 or calling Resend. Cloudflare WAF/rate-limiting rules remain a production edge guard, not a replacement for these code-level controls.

Cloudflare Workers Builds uses a user build token selected and stored in the
Cloudflare dashboard; it is not a GitHub Actions secret. The Platform deploy
command needs D1 edit permission on its separate `clovapi-platform-builds`
token to apply remote migrations. The token is scoped to this account, and its
zone permissions are scoped to `clovapi.com`; Landing keeps its existing build
token and does not run database migrations.
Manual bootstrap or rollback uses the operator's existing Wrangler OAuth login.
No CLI key is required by the repository.

The Platform deploy script runs `wrangler d1 migrations apply DB --remote`
before `wrangler deploy`. A failed migration prevents Worker deployment, and a
failed migration is rolled back by D1. The two operations are not atomic,
however: if the migration succeeds and Worker deployment fails, the old Worker
continues against the new schema. All future D1 changes therefore use
backward-compatible expand/contract migrations.

The repository validator refuses production deployment while the D1 ID is a
sentinel, the Platform custom domain or either Landing Worker Route is missing,
a production `workers.dev` route is enabled, or the landing public API build
variable points at another origin. Wrangler's required-secret declaration
rejects a Platform deploy when one of the three runtime secrets is absent.

## Cutover plan

1. Create a fresh D1 database and replace the sentinel ID in `platform/wrangler.jsonc`.
2. Validate Platform, apply the remote D1 migration, and bootstrap its three
   secrets from an explicit dotenv file with `npm run deploy:bootstrap -- <secrets.env>`.
3. Verify `api.clovapi.com`, including health, catalog, authentication rejection
   and browser CORS behavior.
4. Build Landing with the production API URL and deploy its static assets to
   the apex and `www` Worker Routes.
5. Verify real email delivery, session cookies, every console action and key rotation.
6. Connect a disposable contribution node and verify connection replacement,
   pause/resume and model projection.
7. Exercise both consumer endpoints with streaming and non-streaming payloads;
   test cancellation, a slow consumer, five concurrent calls and a rejected sixth call.
8. Observe errors and request latency, then retire the VPS only after the rollback window. Existing contribution nodes reconnect through their embedded public origin.

Platform and Landing are independent deployments. Deploy Platform first on any
release that changes the public API or schema, and keep D1/API changes
compatible across a rolling deployment.

Rollback is a DNS/Worker-route change during the transition. Because data is intentionally reset, there is no bidirectional database synchronization and no promise that accounts created after the cutover exist in the legacy service.

## Production verification checklist

Completed in this migration:

- A clean D1 migration applies successfully.
- Platform type checking, policy/protocol unit tests and both Worker Wrangler dry-runs pass.
- A local Worker smoke test covers health, catalog GET/HEAD and cache headers, CORS rejection, missing-mail configuration and the scheduled cleanup entry point.
- A complete local relay smoke test covers node registration, WebSocket connection, model publication, a consumer chat request, streamed node frames, terminal audit state and daily usage reservation.
- Go sharing tests cover state-on-change behavior while WebSocket control pings remain active.
- The production D1 database is created in APAC and has no pending migrations.
- `clovapi-platform` is deployed at `api.clovapi.com` with all three required
  Worker secrets, three Durable Object bindings and the hourly scheduled trigger.
- `clovapi-landing` is deployed to both apex and `www` Worker Routes with the
  production API origin embedded in its static assets.
- Public edge smoke tests pass for Platform health/catalog/auth/CORS and Landing
  redirects, localized pages, docs search, `skill.md` and 404 behavior.

Still recommended as post-deployment integration and hardening work:

- Immediately after the first production deploy, run integration smoke tests for hibernation recovery, connection replacement, per-node/per-account concurrency, request cancellation, key revocation and a complete streamed relay.
- Verify real Resend email delivery, the sender domain, session cookies, console
  mutations and key rotation with a production account.
- Add WAF/rate-limiting rules for `/api/auth/code`, `/api/models` and authenticated `/v1/models`, and verify the production Workers plan limits.
