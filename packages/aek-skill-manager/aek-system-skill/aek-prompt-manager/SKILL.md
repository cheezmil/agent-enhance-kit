---
name: aek-prompt-manager
description: Use when injecting global prompts or generating project-local rules for AI coding tools via aekpm: patch/map/remove/status and pr init/gen.
license: MIT
metadata:
  hermes:
    tags: [aek, prompt, global-prompt, project-rules, inject, agent]
---

# aek-prompt-manager

## Overview

向各 AI coding agent 注入全局提示词片段，并生成项目级规则文件。短命令入口 `aekpm`；旧命令 `aek-prompt-manager` 仍保留。

## Global Prompt Sources

| 源目录 | 命令 | 注入语义 |
|---|---|---|
| `global-prompt-mapping/` | `aekpm map <tool>` / `map all` | 原地替换 managed block，块外用户内容保留 |
| `only-patch/` | `aekpm patch <tool>` / `patch all`（`apply` 是别名） | 末尾追加；重复执行原地替换，幂等 |

全局提示词源布局：

```text
~/.aek/prompt-manager/
├── global-prompt-mapping/
└── only-patch/
```

每个全局提示词工具目录包含：

```text
<tool>/
├── cross_platform_shared.md
├── linux.md
├── mac.md
├── windows.md
└── wsl.md
```

## Usage

```bash
aekpm init
aekpm patch codex
aekpm patch all
aekpm map codex
aekpm map all
aekpm remove codex
aekpm status all
aekpm pr init
aekpm pr gen
aekpm pr gen all
aekpm pr gen <agent>
```

## Project Rules (`pr`)

项目源目录：

```text
<PROJECT>/.aek/prompt-manager/project-rules/
├── all-agent-must-comply.md
├── agents/
│   ├── codex.md
│   ├── hermes.md
│   ├── claude.md
│   ├── gemini.md
│   ├── qwencode.md
│   ├── copilot.md
│   ├── vscode.md
│   ├── cursor.md
│   ├── cline.md
│   ├── windsurf.md
│   ├── roocode.md
│   ├── kilocode.md
│   ├── antigravity.md
│   ├── qoder.md
│   ├── kiro.md
│   ├── pi.md
│   ├── deepseek-harness.md
│   ├── openclaw.md
│   ├── zcode.md
│   ├── trae.md
│   ├── trae-cn.md
│   └── opencode.md
└── scripts/
    ├── all.mjs
    ├── codex.mjs
    ├── hermes.mjs
    ├── claude.mjs
    ├── gemini.mjs
    ├── qwencode.mjs
    ├── copilot.mjs
    ├── vscode.mjs
    ├── cursor.mjs
    ├── cline.mjs
    ├── windsurf.mjs
    ├── roocode.mjs
    ├── kilocode.mjs
    ├── antigravity.mjs
    ├── qoder.mjs
    ├── kiro.mjs
    ├── pi.mjs
    ├── deepseek-harness.mjs
    ├── openclaw.mjs
    ├── zcode.mjs
    ├── trae.mjs
    ├── trae-cn.mjs
    └── opencode.mjs
```

`aekpm pr init` 只创建缺失文件；`all-agent-must-comply.md` 和 `agents/*.md` 初始为空，不写注释或模板废话。

生成目标：

| agent | 目标 |
|---|---|
| `codex` | `AGENTS.md` |
| `hermes` | `HERMES.md` |
| `claude` | `CLAUDE.md` |
| `gemini` | `GEMINI.md` |
| `qwencode` | `QWEN.md` |
| `copilot` | `.github/copilot-instructions.md` |
| `vscode` | `.github/copilot-instructions.md` |
| `cursor` | `.cursor/rules/aekpm.md` |
| `cline` | `.cline/rules/aekpm.md` |
| `windsurf` | `.windsurf/rules/aekpm.md` |
| `roocode` | `.roo/rules/aekpm.md` |
| `kilocode` | `.kilocode/rules/aekpm.md` |
| `antigravity` | `.agents/rules/aekpm.md` |
| `qoder` | `AGENTS.md` |
| `kiro` | `.kiro/steering/aekpm.md` |
| `pi` | `AGENTS.md` |
| `deepseek-harness` | `AGENTS.md` |
| `openclaw` | `AGENTS.md` |
| `zcode` | `AGENTS.md` |
| `trae` | `.trae/rules/project_rules.md` |
| `trae-cn` | `.trae-cn/rules/project_rules.md` |
| `opencode` | `AGENTS.md` |

`aekpm pr gen` 使用目标去重，所以共享 `AGENTS.md` 的 agent（如 `codex` / `openclaw` / `qoder` / `pi` / `deepseek-harness` / `zcode`）不会重复写入同一个 block。

项目规则 managed block：

```text
<!-- head-aek-project-rules -->
<all-agent-must-comply.md>
<agents/<agent>.md>
<!-- end-aek-project-rules -->
```

## Supported Global Prompt Tools

`claude-code` · `claude-desktop` · `cline` · `cursor` · `vscode` · `windsurf` · `openclaw` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `pi` · `deepseek-harness` · `zcode` · `trae` · `trae-cn` · `opencode` · `codex` · `hermes`

不支持全局文件注入（GUI 无文件级提示词或无文件型全局规则）：`cherry-studio` · `chatbox` · `continue` · `workbuddy`

## Common Pitfalls

- **全局短命令是 `aekpm`**；源码目录中仍保留 `aek-prompt-manager` bin。
- **项目规则不做平台分支**；平台分支只用于全局 prompt 源。
- **`CLAUDE.md` 不 fallback 到 codex 源**；必须读取 `agents/claude.md`。
- **共享目标必须去重**：`aekpm pr gen all` 对 `AGENTS.md` 只写一次。
- **初始化不会覆盖已有文件**：`init` / `pr init` 只补缺失文件。
- **脚本只是 wrapper**：`scripts/*.mjs` 调 `aekpm pr gen <agent>`，真实逻辑在 `src/project-rules.js`。
- **ESM 禁止 require**：src 全部使用顶层 `import`。
- **路径惰性**：全局 prompt 源路径调用时读取 `HOME`，避免模块加载时快照。

## Verification

```bash
cd packages/aek-prompt-manager
corepack pnpm run test
aekpm pr --help
corepack pnpm -r build
```
