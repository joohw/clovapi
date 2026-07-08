---
title: "Why use a local model API proxy"
description: "A local proxy brings subscriptions, custom APIs, and multiple protocol styles into one debuggable endpoint."
date: "2026-07-08"
---

Model API settings often spread across tools: one base URL here, one key there, and another path shape somewhere else. clovapi brings those differences into one local proxy.

## One endpoint

The local proxy listens on:

```text
http://127.0.0.1:27483
```

Different upstreams are scoped by provider id:

```text
/codex/v1/responses
/claude-code/v1/messages
/custom-api/v1/chat/completions
```

Clients can keep a stable localhost URL.

## Local management

clovapi stores upstream URLs, keys, subscription sessions, model names, and API styles on your machine. The desktop app can show proxy status and call logs.

## Protocol adaptation

Clients can keep using familiar request formats:

- OpenAI Chat Completions
- OpenAI Responses
- Anthropic Messages
- Gemini generateContent

clovapi adapts them at the proxy boundary, reducing repeated client-specific setup.
