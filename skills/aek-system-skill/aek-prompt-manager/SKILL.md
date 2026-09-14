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

管理 AI coding agent 的两类提示词：

1. **全局提示词注入**：向 Claude Code、Codex、OpenCode、Hermes 等工具的全局提示词文件注入 managed block。
2. **项目提示词生成**：在项目目录生成 `AGENTS.md`、`CLAUDE.md`、`.cursorrules` 等项目级 agent 规则文件。

主入口：`aekpm`。兼容旧入口：`aek-prompt-manager`。

## When to Use

- 给多个 agent 工具统一注入全局提示词片段
- 按平台（linux/mac/windows/wsl）区分全局提示词内容
- 为当前项目生成各 agent 的项目级规则文件
- 查看/移除已注入的全局提示词块

## Global Prompt Semantics

| 源目录 | 命令 | 语义 |
|---|---|---|
| `global-prompt-mapping/` | `aekpm map <tool>` / `map all` | **原地替换**：命中已有块整块替换，块外用户内容保留 |
| `only-patch/` | `aekpm patch <tool>` / `patch all`（`apply` 是别名） | **末尾追加**：重复执行命中已有块则原地替换（幂等） |

全局源目录结构：

```text
<HOME>/.aek/prompt-manager/
├── global-prompt-mapping/
│   ├── all_agents_shared/
│   └── <tool_dir>/
└── only-patch/
    ├── all_agents_shared/
    ├── <tool_dir>/
    └── aek_system_prompt/all_agents_shared/
```

每个工具源目录包含：

```text
cross_platform_shared.md
linux.md
mac.md
windows.md
wsl.md
```

合并顺序：

1. `all_agents_shared/cross_platform_shared.md`
2. `all_agents_shared/<current-platform>.md`
3. `<tool_dir>/cross_platform_shared.md`
4. `<tool_dir>/<current-platform>.md`

WSL 识别：`/proc/version` 包含 `microsoft` 时当前平台为 `wsl`。

## Global Prompt Usage

```bash
aekpm init
aekpm patch codex
aekpm patch all
aekpm apply codex
aekpm map codex
aekpm map all
aekpm remove codex
aekpm status all
```

标记块结构：

```text
<!-- head-aek-pm-patch -->
<!-- head-aek-system-built-in-prompt -->
<系统内置提示词 — only-patch/aek_system_prompt/all_agents_shared/>
<!-- end-aek-system-built-in-prompt -->

<!-- head-aek-pm-patch-shared -->
<共享片段>
<!-- end-aek-pm-patch-shared -->

<!-- head-aek-pm-patch-<tool> -->
<工具专属片段>
<!-- end-aek-pm-patch-<tool> -->
<!-- end-aek-pm-patch -->
```

Supported global prompt tools（20）：

`claude-code` · `claude-desktop` · `cline` · `cursor` · `vscode` · `windsurf` · `openclaw` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `pi` · `deepseek-harness` · `zcode` · `trae` · `trae-cn` · `opencode` · `codex` · `hermes`

## Project Rules (`pr`)

### Usage

```bash
aekpm pr init
aekpm pr gen
aekpm pr gen all
aekpm pr gen <agent>
```

项目源目录：

```text
<PROJECT>/.aek/prompt-manager/project-rules/
├── all-agent-must-comply.md
├── agents/
│   ├── codex.md
│   ├── claude.md
│   ├── gemini.md
│   ├── qwencode.md
│   ├── copilot.md
│   ├── cursor.md
│   ├── cline.md
│   ├── roocode.md
│   ├── kilocode.md
│   ├── antigravity.md
│   ├── openclaw.md
│   └── opencode.md
└── scripts/
    ├── all.mjs
    ├── codex.mjs
    ├── claude.mjs
    ├── gemini.mjs
    ├── qwencode.mjs
    ├── copilot.mjs
    ├── cursor.mjs
    ├── cline.mjs
    ├── roocode.mjs
    ├── kilocode.mjs
    ├── antigravity.mjs
    ├── openclaw.mjs
    └── opencode.mjs
```

生成目标：

| agent | 目标 |
|---|---|
| `codex` | `AGENTS.md` |
| `claude` | `CLAUDE.md` |
| `gemini` | `GEMINI.md` |
| `qwencode` | `QWEN.md` |
| `copilot` | `.github/copilot-instructions.md` |
| `cursor` | `.cursorrules` |
| `cline` | `.clinerules` |
| `roocode` | `.roo/rules-<mode>/rules.md` |
| `kilocode` | `.kilocode/rules/aekpm.md` |
| `antigravity` | `.agents/rules/aekpm.md` |
| `openclaw` | `AGENTS.md` |
| `opencode` | `opencode.md` |

`aekpm pr gen` 使用目标去重，所以共享 `AGENTS.md` 的 agent（如 `codex` / `openclaw`）不会重复写入同一个 block。

项目规则 managed block：

```text
<!-- head-aek-project-rules -->
<all-agent-must-comply.md>
<agents/<agent>.md>
<!-- end-aek-project-rules -->
```

## Common Pitfalls

- **全局命令短入口是 `aekpm`**；源码目录中仍保留 `aek-prompt-manager` bin。
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
