English | [中文](README.md)

# clovapi

**Built-in local proxy · Manage agent APIs with ease**

**Website:** https://clovapi.com — [agents](https://clovapi.com/agents) · [guides](https://clovapi.com/guides) · [Agent Skill](https://clovapi.com/skill)


Open-source CLI and desktop app built around a built-in local proxy: save upstream profiles and `switch` them to Claude Code, Codex, OpenCode, and other agents. After switch, traffic goes through `localhost` while clovapi routes upstream and transcodes API formats.

Flow: **`clovapi add --name …`** (save + probe) → **`clovapi switch --cli …`** or interactive **`clovapi switch`** (one CLI at a time).

For **Claude Code**, env wiring matches community **cc-switch** / **ccswitch** (`env.ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`).

## Install

```bash
npm i -g @clovapi/cli
clovapi --help
```

## Common commands

| Command | Description |
|---------|-------------|
| `clovapi list` | Show profiles and active CLI bindings (alias `ls`) |
| `clovapi profiles` | JSON API for load/save/test/catalog (`--json`; see `core/README.md`) |
| `clovapi add --name NAME` | Save upstream profile and probe (`set` / `new`) |
| `clovapi switch [--cli KIND]` | Apply binding to one CLI (`use`; add `--json` for scripts) |
| `clovapi auth` | Subscription OAuth (`status` / `login` / `logout`; `--json`) |
| `clovapi proxy` | Built-in local proxy (`start` / `stop` / `status` / `health`; `--json` where supported) |
| `clovapi reset` | Clear all profiles and bindings (`--yes`) |

Details: [core/README.md](core/README.md).
