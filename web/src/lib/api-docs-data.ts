export type ApiDocDefinition = {
  slug: string;
  title: string;
  description: string;
  content: string;
};

export const API_DOC_PAGES: readonly ApiDocDefinition[] = [
  {
    slug: "quick-start",
    title: "快速开始",
    description: "安装与首个可用配置",
    content: `
# clovapi CLI 快速开始

clovapi 用于把一份上游 API 配置，快速下发到不同 coding agent CLI（Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI）。

## 1) 安装

### npm
\`\`\`bash
npm i -g @clovapi/cli
clovapi --help
\`\`\`

### Homebrew
\`\`\`bash
brew install joohw/homebrew-tap/clovapi
\`\`\`

### winget
\`\`\`powershell
winget install Clovapi.Clovapi
\`\`\`

## 2) 保存一个 profile

\`\`\`bash
clovapi add --name deepseek-claude \\
  --api-style claude \\
  --base-url https://api.deepseek.com/anthropic \\
  --model deepseek-v4-flash \\
  --api-key "$DEEPSEEK_API_KEY"
\`\`\`

## 3) 应用到目标 CLI

\`\`\`bash
clovapi switch --cli claude-code deepseek-claude
\`\`\`

## 4) 查看当前状态

\`\`\`bash
clovapi list
\`\`\`
`,
  },
  {
    slug: "profiles",
    title: "Profile 管理",
    description: "add / list / remove",
    content: `
# Profile 管理

## 新增或更新

\`\`\`bash
clovapi add --name my-openai \\
  --api-style openai-responses \\
  --base-url https://api.openai.com/v1 \\
  --model gpt-4.1-mini \\
  --api-key "$OPENAI_API_KEY"
\`\`\`

如果不传完整参数，会进入交互式输入。

## 列出与查看绑定

\`\`\`bash
clovapi list
\`\`\`

输出包含已保存的 profiles 列表。

## 删除 profile

\`\`\`bash
clovapi remove my-openai
\`\`\`
`,
  },
  {
    slug: "switch",
    title: "切换到各 CLI",
    description: "switch 与 CLI 下发",
    content: `
# 切换与下发

## 指定 CLI + profile（推荐脚本化）

\`\`\`bash
clovapi switch --cli codex deepseek-codex
\`\`\`

## 交互式切换

\`\`\`bash
clovapi switch
\`\`\`

流程是：先选 CLI，再选 profile；也可以在菜单中只重置当前 CLI。

## 验证是否生效

切换完成后，在目标 CLI 中执行一次请求验证即可。
`,
  },
  {
    slug: "troubleshooting",
    title: "故障排查",
    description: "401、冲突、配置覆盖",
    content: `
# 故障排查

## 401 / 403

1. 重新保存 profile 以触发连通性检测：

\`\`\`bash
clovapi add --name <profile-name> ...
\`\`\`

2. 检查：
- API key 是否有效
- Base URL 是否带了正确路径（如 OpenAI 兼容通常带 \`/v1\`）
- 模型名是否存在

## Claude Code 认证冲突

如果出现 token / api key 冲突，重新执行：

\`\`\`bash
clovapi switch --cli claude-code <profile-name>
\`\`\`

并确认 Claude 配置中仅保留 clovapi 写入的认证字段。

## OpenCode 切换后看起来“没变化”

优先检查项目级配置是否覆盖全局配置（例如仓库内 \`opencode.json\`）。

## 一键重置

\`\`\`bash
clovapi reset --yes
\`\`\`

会清空保存的 profile 和 active 绑定，请谨慎执行。
`,
  },
];
