# @clovapi/cli

Install `clovapi` as the global command entry:

```bash
npm i -g @clovapi/cli
clovapi --help
```

**Website:** https://clovapi.com — setup guides, supported agents, and Claude Code / Codex API switching docs.

The npm package provides the `clovapi` launcher on your PATH. During install it downloads the platform core binary, verifies SHA256 checksums, and stores the canonical binary under your user config directory:

- macOS/Linux: `~/.config/clovapi/bin/clovapi`
- Windows: `%APPDATA%\clovapi\bin\clovapi.exe`

The launcher always prefers that user-managed binary, so `clovapi update` and the desktop app update the same executable.

By default it tries:

1. `https://downloads.clovapi.com/clovapi/vX.Y.Z` (R2 public mirror)
2. GitHub Releases fallback

## Environment override

- `CLOVAPI_CLI_BASE_URL`: override download base URL for mirrors or local testing.
- `CLOVAPI_R2_BASE_URL`: override the default R2 base URL (versioned path).

## Docs

- [Supported agents](https://clovapi.com/agents)
- [Setup guides](https://clovapi.com/guides) — third-party APIs for Claude Code & Codex
- [Agent Skill](https://clovapi.com/skill)
