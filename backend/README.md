# clovapi Platform Backend

This container is the deployment target for `api.clovapi.com`. It runs the
Relay data plane and its SQLite-backed admission controller in one Go process.
Consumer APIs are exposed under `/v1`; contribution nodes connect at
`/api/node/connect`.

```sh
cp backend/env.example backend/.env
docker compose --env-file backend/.env -f backend/compose.yaml up -d --build
```

The `/data` volume owns platform state. `CLOVAPI_FRONTEND_URL` is an optional
migration proxy and should stay empty in the split deployment. If enabled, it
also requires a 32-character `CLOVAPI_RELAY_SECRET`. Next.js must not receive
`/v1` or node connection traffic.

The old `relay/` image remains a migration adapter for deployments where
admission still lives in Next.js. New deployments should use `backend/`.

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

For an existing installation, copy the current `clovapi.db` into the `/data`
volume and keep the same `AUTH_SECRET`; otherwise encrypted connection keys
cannot be recovered. Because the public API origin changes, the console rotates
old `clv_connect_` keys the next time the contribution page opens. Restart each
contribution node with the newly displayed command so it connects to
`api.clovapi.com`.
