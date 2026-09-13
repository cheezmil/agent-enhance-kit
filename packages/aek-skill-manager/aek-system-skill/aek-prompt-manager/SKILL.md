---
name: aek-prompt-manager
description: Use when injecting platform-specific prompt fragments into AI coding tools' global prompt files — patch (append) / map (replace) / remove / status / init.
license: MIT
metadata:
  hermes:
    tags: [aek, prompt, global-prompt, inject, agent]
---

# aek-prompt-manager

## Overview

向各 AI coding agent（Claude Code、Codex、OpenCode、Hermes 等）的全局提示词文件注入平台化提示词片段，双源两种注入语义，支持 17 个 agent 工具。CLI 入口 `aek pm` / `aek-prompt-manager`。

## When to Use

- 需要给多个 agent 工具的全局提示词统一注入提示词片段
- 需要按平台（linux/mac/windows/wsl）区分注入内容
- 需要移除/查看已注入的提示词块

## 双源语义

| 源目录 | 命令 | 注入语义 |
|---|---|---|
| `global-prompt-mapping/` | `aek pm map <tool>` / `map all` | **原地替换**：命中已有块整块替换，块外用户内容保留 |
| `only-patch/` | `aek pm patch <tool>` / `patch all`（`apply` 是别名） | **末尾追加**：重复执行命中已有块则原地替换（幂等） |

两个源结构相同：
```text
<source>/
├── all_agents_shared/      # 所有 agent 共用（跨平台 + 按平台）
├── claude_code/            # 下划线命名的 agent 目录（id 中 hyphen → underscore）
├── claude_desktop/ ...
└── hermes/
    每个目录: cross_platform_shared.md / linux.md / mac.md / windows.md / wsl.md
```

only-patch 额外支持系统内置提示词：
```text
only-patch/aek_system_prompt/all_agents_shared/   # 注入到 head-aek-system-built-in-prompt 块
```

5 个平台文件按当前运行平台合并：先读 `cross_platform_shared.md`，再读当前平台文件。WSL 识别（/proc/version 含 microsoft → wsl）。

## Usage

### 初始化（建源目录 + 空平台文件，不覆盖已有内容）

```bash
aek pm init
```

### 注入（末尾追加）

```bash
aek pm patch codex        # 只注入 codex
aek pm patch all          # 注入全部 17 个工具
aek pm apply codex        # patch 别名
```

### 注入（原地替换）

```bash
aek pm map codex
aek pm map all
```

### 移除 / 查看

```bash
aek pm remove codex       # 移除 codex 的 managed block
aek pm status all         # 各工具状态：patched / not-patched / file-missing
```

### 指定工作目录/隔离 HOME（测试）

```bash
FAKE=/tmp/gpm-e2e; mkdir -p "$FAKE"
HOME="$FAKE" aek pm init
HOME="$FAKE" aek pm patch codex
```

## 标记块结构（注入到工具全局提示词文件）

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

## Supported Tools（17）

`claude-code` · `claude-desktop` · `cline` · `cursor` · `vscode` · `windsurf` · `openclaw` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `pi` · `deepseek-harness` · `opencode` · `codex` · `hermes`

不支持（GUI 无文件级提示词或无文件型全局规则）：`cherry-studio` · `chatbox` · `continue` · `workbuddy`

## Common Pitfalls

- **初始化不会覆盖已有文件**：`init` 只补缺失文件，用户已写内容保留（writeIfMissing 语义）
- **cursor / vscode 带 fileHeader**：首次写入时自动加 frontmatter（`.mdc` 需 `globs/alwaysApply`，`.instructions.md` 需 `applyTo: "**"`）
- **ESM 禁止 require**：src/ 全是 ES 模块，用顶层 `import { join } from 'node:path'`
- **路径惰性**：`AEEK_DIR` / `sharedDir()` / `toolDir()` 调用时读取 `process.env.HOME`，不用模块顶层 const 快照

## Verification

```bash
cd packages/aek-prompt-manager
node --test test/core.test.js    # 11 个测试
aek pm status all                # 查看各工具注入状态
aek pm patch codex && cat ~/.codex/AGENTS.md   # 手动确认块内容
```