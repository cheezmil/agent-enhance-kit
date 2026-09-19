---
name: aek-skill-manager
description: Use when syncing Agent Skills (SKILL.md folders) from a central repo to all AI coding tools — sync, pull, init, interactive wizard.
license: MIT
metadata:
  hermes:
    tags: [aek, skill, skill-manager, sync, agent]
---

# aek-skill-manager

## Overview

Sync Agent Skills (SKILL.md folders) from a central repository (`~/.aek/skill-manager/skills/`) to every AI coding tool's global or project directory. Supports 25 agent tools (Claude Code, Cursor, Codex, OpenCode, Hermes, Cline, Kiro, Pi Agent, ZCode, Trae, etc.).

## When to Use

- Need to sync skills to all AI coding tools at once
- Need to install a skill into multiple agent harnesses
- Need to pull skills from a tool back to the central repo
- Need to initialize the central skill repository

## Usage

### Sync skills（默认同步配置的工具）

默认只同步 `~/.aek/skill-manager/settings.jsonc` 中 `syncDefaultTools` 配置的 agent（如 `["hermes", "deepseek-harness"]`），秒完成。

```bash
aek sm sync
```

### 同步所有支持的 agent

```bash
aek sm sync --allagents
```

### 同步指定工具

```bash
aek sm sync --tools claude,cursor,opencode
```

### Pull skills from a tool back to central repo

```bash
aek sm pull claude
```

### Initialize central repo

```bash
aek sm init
```

### Transfer-sync（仅 WSL / Windows 生效）

```bash
aek sm transfer-sync
```

WSL 与 Windows 中心仓库双向对齐，以最新修改的一方为准，覆盖前自动备份。

配置项 `transferSyncBeforeSync: true` 默认开启，仅在 WSL/Windows 下生效，macOS/Linux 原生无此功能。

### Remove skills

```bash
aek sm remove <skill-name>...
aek sm remove --all
aek sm remove <skill-name>... --tools claude,cursor
```

从各工具目录移除指定 skill（支持多个名称），或清空全部。

### Interactive wizard

Run without arguments for a guided interactive setup:

```bash
aek sm
```

## Scopes

| Scope | Central repo path | Target paths |
|-------|------------------|--------------|
| Global (default) | `~/.aek/skill-manager/skills/` | `~/.<tool>/skills/` |
| Project | `.<cwd>/.aek/skill-manager/skills/` | `.<cwd>/.<tool>/skills/` |

## Supported Tools

`claude` · `claude-desktop` · `cherry-studio` · `chatbox` · `cline` · `codex` · `continue` · `copilot` · `cursor` · `gemini` · `hermes` · `opencode` · `openclaw` · `pi` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `vscode` · `windsurf` · `workbuddy` · `zcode` · `trae` · `trae-cn` · `deepseek-harness`

## 性能优化

- 首次 sync 生成 `~/.aek/skill-manager/record.jsonc`，记录各工具最后同步时间
- 后续 sync 只检查 record 缓存，相同工具跳过，毫秒级完成
- 1 分钟内的重复调用会自动跳过 transfer-sync（避免 drvfs 慢写）
- `syncDefaultTools` 只同步必要 agent，避免无脑遍历 25 个平台
