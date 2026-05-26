English | [中文](README.md)

# clovapi

**Built-in local proxy · Manage agent APIs with ease**

**Website:** https://clovapi.com — [agents](https://clovapi.com/agents) · [guides](https://clovapi.com/guides) · [Agent Skill](https://clovapi.com/skill)

**Reference notes:** [Harbor & agent API control](docs/harbor-agents.md) · [中文](docs/harbor-agents.zh.md) · [Agent repo catalog (`ref/` clones)](docs/agent-repos.md)

---

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
| `clovapi list` | Show profiles and CLI matrix (aliases `profiles` / `ls`) |
| `clovapi add --name NAME` | Save upstream profile and probe ( `set` / `new`) |
| `clovapi switch [--cli KIND]` | Apply profile to one CLI (`use`) |
| `clovapi proxy` | Built-in local proxy (`start` / `status` / `config`) |
| `clovapi reset` | Clear all profiles and bindings (`--yes`) |

## Documentation

| | |
|---|---|
| Full docs (English) | [switcher/README.md](switcher/README.md) |
| 完整说明（中文） | [switcher/README.zh.md](switcher/README.zh.md) |
| Reference index | [docs/README.md](docs/README.md) |
| Desktop app | [electron/README.md](electron/README.md) |

## Repository layout

| Directory | Description |
|-----------|-------------|
| [`switcher/`](switcher/) | clovapi CLI (Go) |
| [`electron/`](electron/) | Desktop app (local proxy + GUI) |
| [`landing/`](landing/) | Website [clovapi.com](https://clovapi.com) |
| [`docs/`](docs/) | Harbor / agent reference notes |
