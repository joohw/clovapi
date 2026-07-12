# Smart Subscription Routing Design

## Status

Draft for implementation.

This design keeps clovapi focused on the local API proxy surface:

```text
client -> http://127.0.0.1:{port}/{providerId}/v1/...
       -> proxy router
       -> protocol bridge
       -> upstream provider
```

It does not bring back local tool configuration management. Clients still choose
the local proxy URL and provider id themselves.

## Problem

The current model is simple: a fixed provider id resolves to one persisted
profile/model binding. Official subscriptions are represented as vendor profiles
with one fixed credential location per provider.

That works for a single Codex subscription and a single Claude subscription, but
it does not scale to:

- Multiple accounts for the same subscription provider.
- Failover between subscription accounts.
- Mixing official subscriptions and API-key upstreams for the same requested
  model.
- Routing by health, quota, latency, or preference.
- Clear per-call logs showing which real account/backend served a request.

## Goals

- Allow multiple accounts per subscription provider.
- Keep API-key profiles, local providers, and subscription accounts routable
  through one backend abstraction.
- Preserve existing provider-id based proxy URLs.
- Add deterministic priority routing first.
- Add failover on retriable upstream failures.
- Record the selected backend in call logs without leaking secrets.
- Make the UI understandable without exposing a complex rules engine in the
  first version.

## Non-Goals

- Remote multi-tenant gateway behavior.
- Billing, rate limiting as a product feature, or shared admin dashboards.
- Automatic configuration of external CLIs.
- A full visual rules editor in the first implementation.
- Cross-user synchronization of credentials.

## Current Architecture Summary

Important current pieces:

- `profile.Store` persists `profiles.json`.
- `profile.Profile` stores vendor-level settings and nested `Model` rows.
- `profile.Store.FlatProfileForProviderModel(...)` resolves one model binding.
- `proxyresolve.ResolveForwardRoute(...)` resolves one outbound route.
- `proxy.Server.handleProxy(...)` prepares/transcodes and executes that route.
- Subscription credentials are currently provider-level files, for example
  `subscription/codex.json` and `subscription/claude.json`.
- Desktop UI already has a Profiles tab and a Models tab.

The smart router should be introduced between `ResolveIngressContext` and
`ResolveForwardRoute`, not inside the protocol bridge.

## Core Concepts

### SubscriptionAccount

Represents one logged-in official subscription account.

```json
{
  "id": "sub_codex_personal",
  "kind": "subscription_account",
  "provider_id": "codex",
  "label": "Codex Personal",
  "credential_ref": "subscription/codex/personal.json",
  "status": "active",
  "plan": "Pro",
  "models": [],
  "created_at": "2026-07-12T00:00:00Z",
  "updated_at": "2026-07-12T00:00:00Z"
}
```

Notes:

- Credentials stay outside `profiles.json` when they contain secrets.
- `credential_ref` is a local reference, not credential material.
- Account ids must be stable; display labels can change.
- Built-in single-account files should migrate into account records.

### RouteBackend

A concrete callable upstream candidate. It may come from:

- A nested API-key model under a profile.
- A subscription account model.
- A local provider model.

```json
{
  "id": "backend_codex_personal_gpt_5_5",
  "source_type": "subscription",
  "source_id": "sub_codex_personal",
  "provider_id": "codex",
  "model_id": "gpt-5.5",
  "upstream_model": "gpt-5.5",
  "api_style": "responses",
  "enabled": true,
  "priority": 100,
  "weight": 1,
  "health": {
    "state": "unknown",
    "last_error": "",
    "last_checked_at": ""
  }
}
```

Route backends should initially be derived, not fully hand-authored. This keeps
the first version simple and avoids a second source of truth.

### SmartRoute

An optional routing rule for a provider/model/style tuple.

```json
{
  "id": "route_codex_gpt_5_5",
  "provider_id": "codex",
  "match_model": "gpt-5.5",
  "ingress_api_style": "responses",
  "strategy": "priority_failover",
  "backend_ids": [
    "backend_codex_team_gpt_5_5",
    "backend_codex_personal_gpt_5_5",
    "backend_custom_api_gpt_5_5"
  ],
  "enabled": true
}
```

First version can skip explicit `SmartRoute` storage and derive the route from
backend priority. The data model should still leave room for explicit routes.

## Store Layout

Increment `profile.StoreVersion` when implementation starts.

```go
type Store struct {
    Version       int                   `json:"version"`
    List          []Profile             `json:"profiles"`
    Subscriptions []SubscriptionAccount `json:"subscriptions,omitempty"`
    Routes        []SmartRoute          `json:"routes,omitempty"`
    Proxy         ProxyConfig           `json:"proxy"`
}
```

The current `profiles` array remains valid. This keeps existing users working.

### Migration

On load:

1. Keep existing profiles as-is.
2. If a provider-level subscription credential exists and there is no matching
   account yet, create a default account:
   - `codex-default`
   - `claude-default`
3. Keep existing subscription vendor profiles as compatibility views.
4. Keep old model rows and attach them to the default subscription account when
   a later implementation can do so safely.

No migration should delete credentials.

## Routing Algorithm

### Request Inputs

The router receives:

- `provider_id` from URL path.
- Requested model from the request body or `/models/{model}` path.
- Ingress API style from URL shape.
- Upstream path suffix.

### Candidate Discovery

Build candidate backends in this order:

1. API profile model rows matching provider id and requested model id.
2. Subscription account model rows matching provider id and requested model id.
3. Local provider model rows matching provider id and requested model id.
4. Default model for provider id, only when the request does not specify a
   model.

Matching rules:

- Exact model id match first.
- Exact upstream model match second.
- Optional alias match later.

### Selection

First implementation:

```text
enabled candidates
  -> sort by priority asc
  -> skip unhealthy candidates still in cooldown
  -> choose first
```

If no candidate is available, return a clear route resolution error.

### Failover

On upstream response:

Retry the next candidate when:

- Network error before response.
- `429`
- `500`, `502`, `503`, `504`
- Subscription credential expired errors that are recognizable without parsing
  secrets.

Do not retry when:

- Request body is invalid.
- The client disconnects.
- Upstream returns a deterministic model-not-found error for all candidates.

Retry policy:

- Maximum attempts: number of candidates, capped at 3 for v1.
- No retry for non-idempotent future endpoints unless explicitly allowed.
- Preserve original request body bytes so retries do not re-read a consumed
  stream.

### Health State

Health should be lightweight and local:

```go
type BackendHealth struct {
    State        string    `json:"state"` // unknown, healthy, degraded, unhealthy
    LastError    string    `json:"last_error,omitempty"`
    LastStatus   int       `json:"last_status,omitempty"`
    LastSeenAt   time.Time `json:"last_seen_at,omitempty"`
    CooldownUntil time.Time `json:"cooldown_until,omitempty"`
}
```

Health can start in memory. Persisting it is optional and should not block v1.

## Proxy Changes

Introduce a new package:

```text
core/internal/router
```

Suggested API:

```go
type ResolveInput struct {
    ProviderID   string
    ModelID      string
    IngressStyle apistyle.Style
    PathSuffix   string
}

type Candidate struct {
    BackendID      string
    ProviderID     string
    ModelID        string
    IngressStyle   apistyle.Style
    EgressStyle    apistyle.Style
    EffectiveModel string
    Source         string
    APIKey         string
    AccountID      string
    BaseNormalized string
    UpstreamURL    string
}

type Plan struct {
    Input      ResolveInput
    Candidates []Candidate
}
```

`proxy.Server` should:

1. Build a `router.Plan`.
2. Iterate candidates.
3. Prepare upstream request per candidate.
4. Execute upstream request.
5. Retry if the response/error is retryable.
6. Log the final candidate and failover attempts.

`proxyresolve.ResolveForwardRoute` can remain as the compatibility path and be
wrapped by the new router during the transition.

## Call Log Changes

Add non-secret route metadata:

```go
type CallLogRoute struct {
    BackendID       string   `json:"backendId,omitempty"`
    SourceType      string   `json:"sourceType,omitempty"`
    SourceID        string   `json:"sourceId,omitempty"`
    SourceLabel     string   `json:"sourceLabel,omitempty"`
    ProviderID      string   `json:"providerId,omitempty"`
    RequestedModel  string   `json:"requestedModel,omitempty"`
    UpstreamModel   string   `json:"upstreamModel,omitempty"`
    AttemptCount    int      `json:"attemptCount,omitempty"`
    AttemptBackends []string `json:"attemptBackends,omitempty"`
}
```

UI should show this in the call log detail panel as:

- Requested model
- Served by
- Backend source
- Attempts
- Token usage

## Desktop UI

### Navigation

Keep the current tabs, but evolve content:

- Models: default operational view.
- Profiles: upstream account/profile management.
- Call logs: route observability.

### Profiles Tab

Group sections:

1. Subscription accounts
   - Add account
   - Login/logout
   - Refresh models
   - Rename
   - Delete
   - Active/inactive status

2. API profiles
   - Existing API-key profile management.

3. Local providers
   - Ollama and future local engines.

### Models Tab

Show routable model groups:

```text
gpt-5.5
  1. Codex Team / active / priority 10
  2. Codex Personal / active / priority 20
  3. Custom API / healthy / priority 100
```

First UI controls:

- Enable/disable backend.
- Move up/down priority.
- Copy model id.
- Test backend.

Avoid a full rules editor in v1.

## Subscription Account Files

Current fixed files:

```text
~/.config/clovapi/subscription/codex.json
~/.config/clovapi/subscription/claude.json
```

Future layout:

```text
~/.config/clovapi/subscription/codex/{account_id}.json
~/.config/clovapi/subscription/claude/{account_id}.json
```

Compatibility:

- Read old fixed files as default accounts.
- Write new accounts to per-account paths.
- Do not remove old files until logout/delete is explicit.

## API Surface

Keep existing proxy URLs.

Recommended future debug endpoints:

```text
GET /__debug/routes
GET /__debug/routes?provider_id=codex&model_id=gpt-5.5
POST /__debug/routes/test
```

These endpoints are local/debug only and must not emit secrets.

## Implementation Phases

### Phase 1: Foundation

- Add store fields for `subscriptions` and optional `routes`.
- Add account id and credential ref helpers.
- Add migration for default subscription accounts.
- Add route/backend types without changing runtime routing yet.
- Add unit tests for migration and derived backend generation.

### Phase 2: Derived Backend Router

- Add `core/internal/router`.
- Derive candidates from existing profiles and subscription accounts.
- Replace single-route resolution in proxy with a plan containing one or more
  candidates.
- Keep behavior identical when only one candidate exists.
- Add tests for priority ordering and model matching.

### Phase 3: Failover

- Retry across candidates on retryable failures.
- Add in-memory health state.
- Add call log route metadata.
- Add tests for 429/5xx/network failover.

### Phase 4: Desktop Multi-Account UI

- Add subscription account list.
- Add login flow that creates a selected account record.
- Add refresh models per account.
- Add model pool priority controls.
- Keep Profiles tab understandable for non-power users.

### Phase 5: Smarter Strategies

- Weighted routing.
- Least-used routing using token/call counters.
- Quota-aware routing from subscription/API usage snapshots.
- Latency-aware routing.
- Explicit route rule editor.

## Open Questions

- Should the public provider id remain only `codex`/`claude`, or should the
  user be able to expose account-specific provider ids?
- How should aliases be represented: model-level alias rows or route-level match
  rules?
- Should health cooldown be persisted across proxy restarts?
- Should a failed subscription refresh disable only that backend or the whole
  account?

## Recommended First PR

The first implementation PR should be intentionally small:

1. Add the store structs.
2. Add default account migration.
3. Add a backend derivation function.
4. Add tests.
5. Expose `GET /__debug/routes` for inspection.

No failover and no UI mutation yet. That makes the storage and route model easy
to review before it affects live calls.
