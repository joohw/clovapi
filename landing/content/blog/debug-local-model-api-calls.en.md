---
title: "Debug local model API calls with logs"
description: "Use inbound requests, upstream chunks, token usage, and API key aggregation to diagnose local proxy traffic."
date: "2026-07-08"
---

Model API bugs often come from routes, model names, auth, or protocol shape rather than application code. clovapi keeps those clues together in desktop call logs.

## What gets logged

Each request can show:

- inbound method and path
- upstream status
- raw response chunks
- token usage
- tool call count
- error messages

That is usually enough to tell whether the client path is wrong, the upstream rejected the request, or the response shape is unexpected.

## Aggregate by API key

When multiple clients share the local proxy, API key aggregation helps show traffic by caller. clovapi does not persist the full key; it stores a redacted label and fingerprint for debugging.

## A useful order

1. Check whether the request reached the local proxy.
2. Inspect upstream status and response chunks.
3. Verify api_style, model id, and auth state.

That order is especially helpful when subscriptions and custom upstreams are both configured.
