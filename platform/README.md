# clovapi Cloudflare platform

This Worker owns the public API control plane, D1 account data, and the Durable
Objects that coordinate contribution-node sessions. The schema starts empty;
the legacy SQLite database is intentionally not imported.

Login-code abuse protection is enforced before D1 writes or email delivery by
SQLite-backed `AuthRateGate` Durable Objects. Raw email addresses and client IPs
are never used as object names: the Worker derives keyed hashes and claims both
an email gate (one request per 60 seconds, five per rolling hour) and an IP gate
(five per rolling minute, thirty per rolling hour). A failed mail delivery still
consumes the claim, so provider failures cannot be used to bypass the limit.
The gates keep no in-memory counters; all decisions are reconstructed from their
per-object SQLite storage after eviction or hibernation.

The public model catalog is shared through a canonical 60-second Cache API
snapshot, so `/api/models` and authenticated `/v1/models` do not repeat the same
D1 aggregation at every edge request. An hourly Cron Trigger removes expired
login/session/rate data, old relay audit rows, and usage buckets outside the
catalog window.

## First deployment

1. Create the `clovapi-platform` D1 database, replace the sentinel ID in
   `wrangler.jsonc`, and commit that configuration.
2. Authenticate Wrangler with `wrangler login`; no Cloudflare API token or
   account ID belongs in the repository.
3. Prepare an ignored dotenv file containing only `AUTH_SECRET` (at least 32
   random bytes), `RESEND_API_KEY`, and `RESEND_FROM`.
4. Validate, migrate the fresh D1 database, and bootstrap the Worker with those
   runtime secrets:

   ```bash
   npm run build:cloudflare
   npm run db:migrate
   npm run deploy:bootstrap -- /absolute/path/to/production-secrets.env
   ```

The bootstrap helper filters exactly the three required keys into an OS
temporary file, invokes the locked Wrangler version with `--secrets-file`, and
removes the temporary file in `finally`. It never prints secret values.

The config binds only `api.clovapi.com` and disables `workers.dev`. Add zone
WAF/rate-limiting rules for `/api/auth/code`, `/api/models`, and `/v1/models`
as a production-hardening follow-up before broader public launch.

After bootstrap, Cloudflare Workers Builds runs `npm run build:cloudflare` and
`npm run deploy` for each push to `main`. The deploy command applies only
unapplied remote D1 migrations and then deploys the Worker. Its selected
Cloudflare build token therefore needs D1 edit permission; no token is stored
in GitHub or this repository. Non-production branch builds are disabled, so
`dev` does not deploy or create a preview. A migration and Worker deployment
are not atomic, so future schema changes must use backward-compatible
expand/contract migrations. Direct Wrangler upload remains available for
bootstrap and rollback.

For local development, copy `.dev.vars.example` to the untracked `.dev.vars`
file and replace its secret placeholders. `PUBLIC_ORIGIN` must exactly match
the origin encoded into CLI connection keys.

After seeding or creating a disposable CLI connection key and Consumer API key,
exercise registration, the hibernatable WebSocket and a complete relayed JSON
response without printing either credential:

```bash
CLOVAPI_SMOKE_CONNECTION_KEY=... \
CLOVAPI_SMOKE_CONSUMER_KEY=... \
npm run smoke:relay -- http://127.0.0.1:8787
```
