---
title: How Claude Code fingerprints third-party agents (it's not a string blacklist)
description: A technical breakdown of Anthropic's third-party detection — why renaming "OpenClaw" or "Hermes" doesn't help, what actually trips the classifier, and how clovapi stays on the legal config-layer side.
date: 2026-05-29
---

If you run a Claude subscription through anything other than the official client, you have probably seen this 400:

```
Third-party apps now draw from your extra usage, not your plan limits.
We've added a $XXX credit to get you started. Claim it at claude.ai/settings/usage.
```

Since April 2026, Anthropic splits subscription usage into two pools: **plan limits** for the first-party Claude Code client, and a separate prepaid **extra usage** pool for third-party agents (OpenClaw, OpenCode, Hermes, Aider, …). When you are classified as third-party and that pool is empty, requests are rejected. It is not a rate limit — waiting does not fix it.

The interesting question is: *how does the server know it isn't Claude Code?*

## Myth: it greps for brand names

The intuitive guess is a string blacklist — that `openclaw` or `hermes` somewhere in the request is the trigger. Several people reverse-engineered this and **disproved it**:

- One investigator replaced every case-insensitive `openclaw` with `claude` in a 44KB system prompt. Same request otherwise. **Still blocked.** ([byoky: bisecting the fingerprint](https://byoky.com/blog/anthropic-claude-code-fingerprint))
- Another confirmed `systemPrompt.replaceAll("OpenCode", "Claude Code")` does **not** pass; only removing the whole static prompt does. ([opencode-claude-auth #145](https://github.com/griffinmartin/opencode-claude-auth/issues/145))

> "So it's not literal string matching. The classifier is looking at content patterns, not specific tokens. Probably ML. Definitely not regex."

So a brand-name scrub buys you privacy, not a bypass.

## What actually trips the classifier

The consistent finding across independent write-ups is that detection is **content-based and server-side** — not headers, TLS, or IP. Three signals stack, and any one can flag you:

1. **Headers** — necessary but not sufficient. A `claude-cli/*` user-agent and the `claude-code-*` beta flag are the entry ticket; without them you fail immediately.
2. **Tool names** — Claude Code's canonical PascalCase vocabulary (`Read`, `Bash`, `Edit`). Lowercase / snake_case names (`read_file`, `terminal`) read as third-party.
3. **System prompt shape** — the `system` field is inspected by what looks like a content classifier. Long agent-framework prompts (persona, memory rules, heartbeat protocols) are flagged **even after brand markers are stripped**.

A telling detail: the classifier only inspects the **static** portion of the system prompt. Runtime-injected sections (`<env>`, directory listings, your `AGENTS.md`) pass through with arbitrary content — otherwise legitimate Claude Code users couldn't add project instructions.

## The irony

The classifier is aggressive enough to misfire. Anthropic's own Claude Code **VS Code extension** has been wrongly blocked with the same error ([claude-code #45016](https://github.com/anthropics/claude-code/issues/45016)), and at least one user tripped it just by pasting a structured CRM ticket into a stock terminal session.

## Where clovapi sits

clovapi is a **configuration layer**, not an evasion proxy. It does not forge a first-party identity to dodge billing. What it does:

- Organize **credentials you already obtained legally** (official OAuth flows, API keys, gateways) into profiles.
- Apply them per CLI with `switch`, and transcode API formats through a local proxy.

If you want Claude on a subscription, the supported path is still the official Claude Code client. If you want third-party agents, the durable answer is **API-key billing**, not OAuth spoofing:

```bash
clovapi switch --cli claude-code --vendor "Custom API" --model <model-id>
clovapi switch --cli opencode --vendor "Custom API" --model <model-id>
```

The takeaway from the reverse-engineering threads is not "find the magic string." It is that identity detection is now a moving, content-level classifier — so the stable strategy is to bill correctly, not to out-run a model that keeps learning.

## Read more

- [After Anthropic blocked third-party OAuth, how should agent users wire APIs?](/blog/anthropic-oauth-ban-agent-workflow)
- [Claude Code tier routing on a budget](/blog/claude-code-tier-routing-on-a-budget)
- [Claude Code third-party API](/guides/claude-code-third-party-api)
