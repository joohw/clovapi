---
title: "Use a Codex subscription as a local API"
description: "Expose a Codex subscription through localhost with an OpenAI Responses-compatible route."
date: "2026-07-08"
---

Codex subscriptions are convenient for interactive use, while many clients expect a stable API endpoint. clovapi keeps that bridge local: sign in, start the proxy, then call a fixed localhost URL.

## Basic flow

```bash
npm i -g @clovapi/cli
clovapi auth login --provider codex
clovapi proxy start
```

Then point clients at:

```text
http://127.0.0.1:27483/codex/v1/responses
```

Subscription session data stays on your machine. The proxy applies upstream auth when requests arrive.

## Why use a local endpoint

- Client configuration stays stable.
- Call logs can aggregate traffic by API key.
- Responses, Messages, Chat Completions, and Gemini-style requests can be adapted locally.

## Debugging tips

If a request fails, check:

1. The proxy is running.
2. The subscription is still signed in.
3. The client is using `/codex/v1/responses`.

The desktop call log shows inbound requests, upstream response chunks, and errors, which is usually enough to find protocol or auth issues.
