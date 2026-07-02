# Clov API代理

Electron UI for the clovapi local API proxy. It shares `profiles.json` with the Go CLI and exposes profile management, proxy status, call logs, system logs, and updates.

## Config Location

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\clovapi\profiles.json` |
| macOS / Linux | `~/.config/clovapi/profiles.json` or `$XDG_CONFIG_HOME/clovapi/profiles.json` |

## UI

Renderer: Svelte 5 + Vite under `ui/`.

Production build output: `ui-dist/`.

## Development

```bash
cd electron
npm install
npm run dev
```

Development runs Vite on `http://127.0.0.1:31873` and Electron with `ELECTRON_DEV=1`. Use the Electron window that opens automatically.

Production-style run:

```bash
npm run start
```

## Release

Pushes to `main` that touch `electron/**` trigger `.github/workflows/release-desktop.yml` when R2 secrets are configured.
