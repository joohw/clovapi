# clovapi Relay

`relay/` is the independently deployable consumption gateway for the clovapi network. It builds the standalone Go entry point in `core/cmd/relay` and does not contain the Next.js website.

## Responsibilities

The Relay owns the public model-consumption and contributor-connection surface:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /api/node/connect` (WebSocket upgrade)
- `GET /health`

It authenticates and reserves requests through the private control-plane API, selects a connected contributor node, and streams bytes between the consumer and that node. Protocol conversion and upstream credentials remain on the contributor CLI.

The Relay is independent from the Next.js frontend process, but it still requires a control-plane service implementing `/api/internal/relay` for API-key validation, quotas, reservations, and completion accounting. Today that private API lives in the landing application; it can move to a dedicated backend later without changing the Relay's public API.

## Run with Docker Compose

Create a local environment file from `env.example`, replace the secret, and point `CLOVAPI_CONTROL_PLANE_URL` at the private control-plane origin. The secret must match the control plane and must never be exposed to browsers or contributors.

```bash
docker compose --env-file relay/.env -f relay/compose.yaml up -d --build
```

Run the command from the repository root because the Docker build context includes `core/`.

## Build the image directly

```bash
docker build -f relay/Dockerfile -t clovapi-relay .
docker run --rm -p 3100:3100 \
  -e CLOVAPI_CONTROL_PLANE_URL=http://control-plane:3101 \
  -e CLOVAPI_RELAY_SECRET=replace-with-a-random-secret-at-least-32-characters \
  clovapi-relay
```

## Future `clovapi.com/v1` routing

The edge proxy should send the following paths to this container:

- `/v1/models`
- `/v1/chat/completions`
- `/v1/responses`
- `/api/node/connect`

Website and documentation routes continue to go to the Next.js frontend. `/internal/events` is a private Relay callback and should only be reachable from the control-plane network, not exposed as a public edge route.

The existing combined landing runtime remains available during migration. Remove its bundled Relay only after the edge routes above point to the standalone container and contributor connections have been verified.
