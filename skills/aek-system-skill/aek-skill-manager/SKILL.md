---
name: aek-skill-manager
description: Use when syncing Agent Skills (SKILL.md) from a central repo to all AI coding tools — sync, pull, init, interactive wizard.
license: MIT
metadata:
  hermes:
    tags: [aek, skill, skill-manager, sync, agent]
---

# aek-skill-manager

## Overview

Sync Agent Skills (SKILL.md folders) from a central repository (`~/.aek/skill-manager/skills/`) to every AI coding tool's global or project directory. Supports 20+ agent tools (Claude Code, Cursor, Codex, OpenCode, Hermes, Cline, Kiro, Pi Agent, etc.).

## When to Use

- Need to sync skills to all AI coding tools at once
- Need to install a skill into multiple agent harnesses
- Need to pull skills from a tool back to the central repo
- Need to initialize the central skill repository

## Usage

### Sync skills to all tools

```bash
aek sm sync
```

### Sync to specific tools only

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

### Transfer-sync (WSL ↔ Windows mirror)

```bash
aek sm transfer-sync
```

以最新修改的一方为准，双向对齐中心仓库。覆盖前自动备份。

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

`claude` · `claude-desktop` · `cherry-studio` · `chatbox` · `cline` · `codex` · `continue` · `copilot` · `cursor` · `gemini` · `hermes` · `opencode` · `openclaw` · `pi` · `qoder` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `vscode` · `windsurf` · `workbuddy`