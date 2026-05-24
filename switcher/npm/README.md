# @clovapi/cli

Install `clovapi` as a global npm command:

```bash
npm i -g @clovapi/cli
clovapi --help
```

**Website:** https://clovapi.com — setup guides, supported agents, and Claude Code / Codex API switching docs.

The package downloads platform binaries and verifies SHA256 checksums.
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
