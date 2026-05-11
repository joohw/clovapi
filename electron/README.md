# ClovAPI Desktop Client (Minimal)

This is a minimal Electron desktop client for running CLI commands with a UI that matches the ClovAPI website style.

## Features

- Minimal command runner (input command, execute, stream output)
- Stop running process
- Custom working directory
- Website-inspired dark visual style

## Start

From repository root:

```bash
cd electron
npm install
npm run dev
```

## Default command

The default command is:

```bash
clovapi --help
```

Change it in the UI to run any local command-line tool.
