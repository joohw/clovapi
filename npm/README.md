# @clovapi/cli

Install `clovapi` as a global command:

```bash
npm i -g @clovapi/cli
clovapi --help
```

The npm package provides a launcher on your PATH. During install it downloads the platform core binary, verifies SHA256 checksums, and stores the canonical binary under your user config directory:

| OS | Binary |
| --- | --- |
| Windows | `%APPDATA%\clovapi\bin\clovapi.exe` |
| macOS / Linux | `~/.config/clovapi/bin/clovapi` |

The launcher always prefers that user-managed binary, so `clovapi update` and the desktop app update the same executable.

Download order:

1. `https://downloads.clovapi.com/clovapi/vX.Y.Z`
2. GitHub Releases fallback

## Environment Override

- `CLOVAPI_CLI_BASE_URL`: override download base URL for mirrors or local testing.
- `CLOVAPI_R2_BASE_URL`: override the default R2 base URL.
