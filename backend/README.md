# Legacy Go Platform Backend

This container is the pre-Cloudflare rollback target. New deployments use the
Cloudflare Worker in `platform/`, with D1 for the control plane and per-node
Durable Objects for the relay. The Go backend remains temporarily available for
cutover testing; it is not the target production architecture.

```sh
cp backend/env.example backend/.env
docker compose --env-file backend/.env -f backend/compose.yaml up -d --build
```

The `/data` volume owns platform state. `CLOVAPI_FRONTEND_URL` is an optional
migration proxy and should stay empty in the split deployment. If enabled, it
also requires a 32-character `CLOVAPI_RELAY_SECRET`. Next.js must not receive
`/v1` or node connection traffic.

The old `relay/` image remains a migration adapter for deployments where
admission still lives in Next.js. Do not start either legacy service for a new
Cloudflare deployment.

To build both independent containers on one server, use:

```sh
docker compose --env-file backend/.env -f backend/compose.stack.yaml up -d --build
```

Map the web port to `clovapi.com` and the backend port to `api.clovapi.com`.

Platform-owned supply is still a normal Contribution Node. After obtaining a
new `clv_connect_` key from the official account, set
`CLOVAPI_OFFICIAL_NODE_KEY` and start the optional third container:

```sh
docker compose --env-file backend/.env -f backend/compose.stack.yaml --profile official up -d --build
```

The Cloudflare migration intentionally starts from an empty D1 database; no
SQLite import is provided. See `docs/cloudflare-migration.md` for the state
mapping, validation gates and DNS cutover sequence.
