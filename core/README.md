# clovapi core

Go CLI and local proxy core for clovapi.

Agent CLI switching has moved to [clovagent](https://github.com/joohw/clovagent).

## Commands

```bash
go build ./cmd/clovapi
go test ./...
```

```bash
clovapi proxy start
clovapi proxy status
clovapi profiles load --json
clovapi profiles save --json
clovapi profiles test --provider custom-api --model my-model --json
```

## Proxy Shape

The local proxy listens on the configured host/port, defaulting to:

```text
http://127.0.0.1:27483
```

Provider-scoped ingress:

```text
http://127.0.0.1:27483/{providerId}/v1/...
```

The proxy resolves `{providerId}` from `profiles.json`, forwards to the configured upstream, and converts request/response formats when needed.

## Storage

Profiles are stored in:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\clovapi\profiles.json` |
| macOS / Linux | `~/.config/clovapi/profiles.json` or `$XDG_CONFIG_HOME/clovapi/profiles.json` |
