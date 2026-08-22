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