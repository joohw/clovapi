# @clovapi/cli

Install `clovapi` as a global npm command:

```bash
npm i -g @clovapi/cli
clovapi --help
```

The package downloads platform binaries and verifies SHA256 checksums.
By default it tries:

1. `https://downloads.clovapi.com/clovapi/vX.Y.Z` (R2 public mirror)
2. GitHub Releases fallback

## Environment override

- `CLOVAPI_CLI_BASE_URL`: override download base URL for mirrors or local testing.
- `CLOVAPI_R2_BASE_URL`: override the default R2 base URL (versioned path).
