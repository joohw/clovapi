# ADR-0005: Cloudflare-native platform and per-node relay objects

- Status: Accepted
- Date: 2026-09-20
- Supersedes: ADR-0004 for platform deployment and persistence

## Context

The original platform combined the control plane and relay in one long-running Go process backed by a local SQLite file. That made node WebSocket ownership, admission and request streaming straightforward, but it also made a single VPS the deployment and scaling boundary.

clovapi is still early enough to discard the current platform data. Contribution nodes must remain supported, and their upstream credentials must remain on the contributor's machine. The replacement therefore needs to preserve the public API and relay protocol without requiring a data migration.

Cloudflare Workers can serve the HTTP and streaming API, but a stateless Worker isolate cannot own an inbound node connection or enforce a node-wide concurrency limit. D1 is suitable for globally queryable control-plane records, but its single-database write path is not the right authority for per-frame relay state.

## Decision

The platform will be split into two independently deployable Workers:

1. The **Web App Worker** runs the existing Next.js landing, documentation and browser console.
2. The **Platform Worker** exposes authentication, control-plane, catalog, node ingress and OpenAI-compatible consumer routes.

The Platform Worker uses these state boundaries:

- **D1** stores accounts, sessions, hashed credentials, node configuration, queryable node/model projections, balances, ledger records and terminal request audit data.
- One SQLite-backed **Relay Object** (`NodeSession`) is addressed by each contribution node ID. It owns that node's inbound hibernatable WebSocket, advertised models, daily counter, five request slots, in-flight jobs, flow control and cancellation.
- One SQLite-backed **Account Gate** (`AccountGate`) is addressed by each account ID. It owns the account-wide in-flight limit and the request-to-node bindings needed for revocation and cleanup.
- SQLite-backed **Auth Rate Gates** (`AuthRateGate`) are addressed by keyed hashes of an email address or client IP. They atomically bound verification-email issuance before a D1 write or mail-provider call without placing raw identifiers in object names.
- **Queues** may be added for terminal audit and usage aggregation once that work is asynchronous. They are not in the real-time relay path.

The contribution CLI remains a Go program on contributor machines. It continues to initiate the WebSocket connection, keep upstream credentials local and use relay protocol version 1. The browser continues to call a separate platform origin.

## Consequences

- No VPS or shared mounted volume is required for the platform.
- Multiple Worker isolates can accept public traffic because live ownership is resolved through named Durable Objects.
- An idle contribution connection can hibernate without application code running. Deployment or runtime restarts can still disconnect sockets, so the CLI's reconnect behavior remains required.
- D1 projections can briefly lag the real connection. Candidate lookup is advisory; `NodeSession` is the final authority before dispatch.
- A request is never retried on another node after dispatch is uncertain, because the first upstream may already be executing and charging for it.
- Active relay jobs and stream buffers exist only in `NodeSession` memory and fail rather than replay after a restart. Request and response bodies are streamed and not persisted. Running/terminal metadata is projected to D1 and may later move to an idempotent Queue consumer.
- The old Go platform backend remains available only as a temporary migration fallback. It is not the target production architecture.

## Rejected alternatives

### Put all relay state in D1

This would turn connection heartbeats and request frames into globally serialized database writes and still would not provide a live WebSocket owner.

### Run the existing Go backend in a Worker

The backend depends on a long-lived process, an in-memory node map and a local SQLite file. Porting the binary would not preserve those guarantees in the Workers execution model.

### Use one global Durable Object

It would recreate a single-process bottleneck. Per-node and per-account objects preserve the actual consistency domains and scale independently.

### Replace contributor nodes with Cloudflare-hosted upstream credentials

That would change the trust boundary and the product. Contributor credentials stay on contributor-controlled machines.
