---
title: Claude Code 是怎么识别第三方 Agent 的（不是字符串黑名单）
description: 拆解 Anthropic 的第三方检测机制：为什么把 OpenClaw、Hermes 改个名没用、到底是什么触发了分类器，以及 clovapi 为何始终站在「合法配置层」这一侧。
date: 2026-05-29
---

只要你用非官方客户端跑 Claude 订阅，大概率见过这个 400：

```
Third-party apps now draw from your extra usage, not your plan limits.
We've added a $XXX credit to get you started. Claim it at claude.ai/settings/usage.
```

2026 年 4 月起，Anthropic 把订阅用量拆成两个池子：**plan limits** 给官方 Claude Code 客户端，另设一个预付的 **extra usage** 池给第三方 Agent（OpenClaw、OpenCode、Hermes、Aider…）。当你被判为第三方、且该池余额为 0 时，请求直接被拒。这不是限流——等不会好。

有意思的问题是：**服务端到底怎么知道你不是 Claude Code？**

## 误解：它在 grep 品牌名

直觉答案是「字符串黑名单」——以为请求里出现 `openclaw`、`hermes` 就被命中。几个人逆向后**证伪了这个假设**：

- 有人把一份 44KB system prompt 里所有不区分大小写的 `openclaw` 全替换成 `claude`，其余不变，**照样被 block**。([byoky：逆向指纹](https://byoky.com/blog/anthropic-claude-code-fingerprint))
- 另有人确认 `systemPrompt.replaceAll("OpenCode", "Claude Code")` **过不了**，只有删掉整段静态 prompt 才行。([opencode-claude-auth #145](https://github.com/griffinmartin/opencode-claude-auth/issues/145))

> "So it's not literal string matching. The classifier is looking at content patterns, not specific tokens. Probably ML. Definitely not regex."

所以「抹掉品牌名」换来的是隐私，不是绕过。

## 真正触发分类器的是什么

各方独立记录的一致结论是：检测**基于内容、在服务端完成**——和 headers / TLS / IP 无关。三个信号叠加，任一即可命中：

1. **Headers**——必要但不充分。`claude-cli/*` 的 user-agent 加 `claude-code-*` beta flag 是入场券；缺了直接挂。
2. **工具名**——Claude Code 的规范 PascalCase 词表（`Read`、`Bash`、`Edit`）。小写 / snake_case（`read_file`、`terminal`）一眼第三方。
3. **System prompt 形态**——`system` 字段会被一个类似内容分类器的东西审查。长 agent 框架提示词（人设、记忆规则、心跳协议）**即使抹掉品牌名也会被判**。

一个关键细节：分类器只查 system prompt 的**静态部分**。运行时注入的段落（`<env>`、目录清单、你的 `AGENTS.md`）内容再花也放行——否则正常 Claude Code 用户没法加项目指令。

## 反讽之处

这个分类器激进到会误伤。Anthropic 自家的 Claude Code **VS Code 插件**就被同样的报错错误拦截过（[claude-code #45016](https://github.com/anthropics/claude-code/issues/45016)），还有用户只是在原生终端里粘了一段结构化的 CRM 工单文本就被判第三方。

## clovapi 站在哪一侧

clovapi 是**配置层**，不是绕过代理。它不会伪造 first-party 身份来逃避计费。它做的是：

- 把**你已合法获得的凭据**（官方 OAuth 写入、API Key、第三方网关）整理成 profile。
- 按 CLI `switch` 应用，并通过本地代理做 API 形态转码。

想用订阅，受支持的路径仍是官方 Claude Code 客户端；想用第三方 Agent，可长期执行的答案是 **API Key 计费**，而不是 OAuth 伪装：

```bash
clovapi switch --cli claude-code --vendor "Custom API" --model <model-id>
clovapi switch --cli opencode --vendor "Custom API" --model <model-id>
```

逆向讨论的真正启示，不是「找到那个魔法字符串」，而是：身份检测已经变成一个会持续学习、在内容层运作的分类器——所以稳定策略是把账单付对，而不是去追一个一直在进化的模型。

## 延伸阅读

- [Anthropic 封禁第三方 OAuth 之后，Agent 用户该怎么配 API？](/blog/anthropic-oauth-ban-agent-workflow)
- [预算有限时的 Claude Code 分级路由](/blog/claude-code-tier-routing-on-a-budget)
- [Claude Code 第三方 API](/guides/claude-code-third-party-api)
