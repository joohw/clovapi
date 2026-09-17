# clovapi core

Go CLI, contribution-node runtime, and local protocol bridge for the clovapi shared model API network.

Agent CLI switching has moved to [clovagent](https://github.com/joohw/clovagent).

Consumers call online shared models through the clovapi platform and do not need this CLI. The CLI is for contributors who want to connect model capacity they are authorized to share.

## Development commands

```bash
go build ./cmd
go test ./...
```

```bash
clovapi proxy start
clovapi proxy status
clovapi profiles load --json
clovapi profiles save --json
clovapi profiles test --provider custom --model my-model --json
```

## Contributing shared models

Copy the account connection command from the console and run it locally:

```bash
clovapi share start --key YOUR_CLI_CONNECTION_KEY
```

The key identifies the account and platform. Starting the CLI creates or reconnects one instance node and automatically syncs all available locally configured models; no platform, profile or model selection is required. Upstream API keys and base URLs stay local. Later starts can use `clovapi share start` with the saved node credential.

Use `share status`, `share pause`, and `share resume` to inspect or control the node, or disconnect it in the console. The CLI opens a persistent outbound WebSocket to the platform relay for immediate request dispatch and streaming responses. All models share five concurrent request slots and a persisted UTC daily request limit; token billing and credit settlement are not enabled. See [CLI sharing](../docs/cli-sharing.md) for setup, API examples, and operational limits.

## Advanced local proxy

The local proxy powers contribution-node execution and protocol translation and remains available as a standalone advanced mode. It is not clovapi's primary product identity. It listens on the configured host/port, defaulting to:

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

## Browser UI

Build from the repository root with `npm ci --prefix web` and `npm run build`, then run `core/clovapi serve` (`core\clovapi.exe serve` on Windows). Open http://127.0.0.1:27484. The embedded Vite UI is served by Go on a loopback listener independent of the proxy. A direct `go build` without first building the UI produces a CLI-only development binary with a build-instructions page.
