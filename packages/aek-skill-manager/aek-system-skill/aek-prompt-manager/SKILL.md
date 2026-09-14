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
├── ALL-AGENTS-MUST-COMPLY.md
├── for-certain-agents/           # 每个 agent 一个子目录，目录名 = 目标相对路径（'/'->'@'，'.'->'#'，保留大小写）
│   ├── AGENTS#md/                # -> AGENTS.md：CODEX.md / QODER.md / PI.md / DEEPSEEK-HARNESS.md / OPENCLAW.md / ZCODE.md / OPENCODE.md
│   ├── HERMES#md/HERMES.md       # -> HERMES.md
│   ├── CLAUDE#md/CLAUDE.md       # -> CLAUDE.md
│   ├── GEMINI#md/GEMINI.md       # -> GEMINI.md
│   ├── QWEN#md/QWENCODE.md       # -> QWEN.md
│   ├── #github@copilot-instructions#md/   # -> .github/copilot-instructions.md：COPILOT.md / VSCODE.md
│   ├── #cursor@rules@CURSOR#md/CURSOR.md
│   ├── #cline@rules@CLINE#md/CLINE.md
│   ├── #windsurf@rules@WINDSURF#md/WINDSURF.md
│   ├── #roo@rules@ROOCODE#md/ROOCODE.md
│   ├── #kilocode@rules@KILOCODE#md/KILOCODE.md
│   ├── #agents@rules@ANTIGRAVITY#md/ANTIGRAVITY.md
│   ├── #kiro@steering@KIRO#md/KIRO.md
│   ├── #trae@rules@TRAE#md/TRAE.md
│   └── #trae-cn@rules@TRAE-CN#md/TRAE-CN.md
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

`aekpm pr init` 只创建缺失文件；`ALL-AGENTS-MUST-COMPLY.md` 和 `for-certain-agents/**/*.md` 初始为空，不写注释或模板废话。

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
| `cursor` | `.cursor/rules/CURSOR.md` |
| `cline` | `.cline/rules/CLINE.md` |
| `windsurf` | `.windsurf/rules/WINDSURF.md` |
| `roocode` | `.roo/rules/ROOCODE.md` |
| `kilocode` | `.kilocode/rules/KILOCODE.md` |
| `antigravity` | `.agents/rules/ANTIGRAVITY.md` |
| `qoder` | `AGENTS.md` |
| `kiro` | `.kiro/steering/KIRO.md` |
| `pi` | `AGENTS.md` |
| `deepseek-harness` | `AGENTS.md` |
| `openclaw` | `AGENTS.md` |
| `zcode` | `AGENTS.md` |
| `trae` | `.trae/rules/TRAE.md` |
| `trae-cn` | `.trae-cn/rules/TRAE-CN.md` |
| `opencode` | `AGENTS.md` |

`aekpm pr gen` 使用目标去重，所以共享 `AGENTS.md` 的 agent（如 `codex` / `openclaw` / `qoder` / `pi` / `deepseek-harness` / `zcode`）不会重复写入同一个 block。

项目规则 managed block（以 AGENTS.md 为例，子块按源文件名 A-Z 排列）：

```text
<!-- head-aek-prompt-manager -->
<ALL-AGENTS-MUST-COMPLY.md 的内容，全文件只此一份>

<!-- head-codex -->
<AGENTS#md/CODEX.md 的内容>
<!-- end-codex -->

<!-- head-deepseek-harness -->
<AGENTS#md/DEEPSEEK-HARNESS.md 的内容>
<!-- end-deepseek-harness -->

...
<!-- end-aek-prompt-manager -->
```

- `pr gen <agent>` 只更新外壳（含 ALL-AGENTS-MUST-COMPLY 内容）与自己的 `head-<agent>` 子块，其他子块原样保留。
- `pr gen all` 重写全部子块。
- 旧格式 `head/end-aek-project-rules` 会被自动迁移为新格式。

## Supported Global Prompt Tools

`claude-code` · `claude-desktop` · `cline` · `cursor` · `vscode` · `windsurf` · `openclaw` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `pi` · `deepseek-harness` · `zcode` · `trae` · `trae-cn` · `opencode` · `codex` · `hermes`

不支持全局文件注入（GUI 无文件级提示词或无文件型全局规则）：`cherry-studio` · `chatbox` · `continue` · `workbuddy`

## Common Pitfalls

- **全局短命令是 `aekpm`**；源码目录中仍保留 `aek-prompt-manager` bin。
- **项目规则不做平台分支**；平台分支只用于全局 prompt 源。
- **`CLAUDE.md` 不 fallback 到 codex 源**；必须读取 `for-certain-agents/CLAUDE#md/CLAUDE.md`。
- **按目标相对路径分组**：每个 agent 的源 md 放在以其目标相对路径命名的子目录（`/` 一律用 `@` 表示、`.` 一律用 `#` 表示、保留原始大小写，如 `AGENTS.md` → `AGENTS#md/`、`.cursor/rules/CURSOR.md` → `#cursor@rules@CURSOR#md/`）；源 md 文件名一律为 agent id 大写（如 `ANTIGRAVITY.md`）；共享同一物理目标文件的 agent 自然落在同一目录（如 7 个 agent 共享 `AGENTS#md/`）。
- **目标文件命名**：工具官方硬性约定的文件名保持原样（`AGENTS.md`/`CLAUDE.md`/`HERMES.md`/`GEMINI.md`/`QWEN.md`/`copilot-instructions.md`）；可自由命名的规则文件一律用工具名大写（`.agents/rules/ANTIGRAVITY.md`、`.cursor/rules/CURSOR.md` 等），不再用 `aekpm.md`。
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
