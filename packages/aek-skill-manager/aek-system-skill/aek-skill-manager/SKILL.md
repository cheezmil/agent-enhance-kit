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

### Align WSL ↔ Windows central repos (transfer-sync)

```bash
aek sm transfer-sync          # 以最新修改的一方为准，整目录对齐；覆盖前自动备份
aek sm transfer-sync --force  # 即使两边 mtime 一致也强制以本地为准覆盖对侧
```

仅作用于全局中心仓库 `~/.aek/skill-manager/skills/`：
- 在 WSL 中执行：对侧是 Windows 原生 `%USERPROFILE%\.aek\skill-manager\skills`（经 /mnt/c 访问）
- 在 Windows 中执行：对侧是 WSL `\\wsl.localhost\<distro>\home\<user>\.aek\skill-manager\skills`（发行版名自动探测并缓存进配置）

配置文件 `~/.aek/skill-manager/settings.jsonc`：
- `transferSyncBeforeSync`（默认 true）：`aek sm sync` 前自动执行 transfer-sync
- `transferBackupKeep`（默认 3）：覆盖前备份到 `~/.aek/skill-manager/backup/skills.bak.<timestamp>/`，保留最近 N 份
- `wslDistro`：缓存探测到的 WSL 发行版名，失效自动清理重新探测

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