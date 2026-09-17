# clovapi Development Notes

clovapi is now scoped to local API proxy behavior.

## Main Concepts

- `profile`: local provider configuration, including base URL, API key, API style, and models.
- `proxy`: local HTTP server that accepts `/{providerId}/v1/...` requests.
- `protocol`: normalized request/response IR plus encoders/decoders for supported upstream formats.
- `proxyresolve`: provider/model resolution and upstream auth header shaping.
- `call logs`: persisted request, upstream response, token usage, and session metadata.

## Flow

```text
client request
  -> local proxy /{providerId}/v1/...
  -> resolve provider profile
  -> decode request into protocol IR
  -> encode request for upstream API style
  -> upstream provider
  -> decode upstream response/SSE
  -> encode client response/SSE
```

## Development

The management UI lives in `web/` (React + Vite), and Go serves its embedded static build on a separate loopback listener. Electron has been removed.

Run `npm ci --prefix web`, then `npm run dev` at the repository root. Open http://127.0.0.1:31873. Build a self-contained binary with `npm run build`, then run `core/clovapi serve` and open http://127.0.0.1:27484.

`/api/admin/*` uses JSON POST requests with `X-Clovapi-Admin: 1`, exact Host/Origin checks, and loopback peer checks. The proxy remains on its independently configurable address. Management survives proxy stop and rebind.

```bash
cd core
go test ./...
```
