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

```bash
cd core
go test ./...
```
