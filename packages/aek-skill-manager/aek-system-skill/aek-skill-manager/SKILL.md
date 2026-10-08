---
name: aek-skill-manager
description: Use when generating Agent Skills (SKILL.md folders) from a central repo into all AI coding tools — gen, pull, init, interactive wizard.
license: MIT
metadata:
  hermes:
    tags: [aek, skill, skill-manager, gen, agent]
---

# aek-skill-manager

## Overview

Generate Agent Skills (SKILL.md folders) from a central repository (`~/.aek/skill-manager/skills/`) into every AI coding tool's global or project directory. Supports 25 agent tools (Claude Code, Cursor, Codex, OpenCode, Hermes, Cline, Kiro, Pi Agent, ZCode, Trae, etc.).

## When to Use

- Need to generate skills into all AI coding tools at once
- Need to install a skill into multiple agent harnesses
- Need to pull skills from a tool back to the central repo
- Need to initialize the central skill repository

## Usage

### Gen skills（默认生成到配置的工具）

默认只生成到 `~/.aek/skill-manager/settings.yml` 中 `genDefaultTools` 配置的 agent（如 `[hermes, deepseek-harness]`），秒完成。

```bash
aeksm gen
```

### 生成到所有支持的 agent

```bash
aeksm gen --allagents
```

### 生成到指定工具

```bash
aeksm gen --tools claude,cursor,opencode
```

### Pull skills from a tool back to central repo

```bash
aeksm pull claude
```

### Initialize central repo

```bash
aeksm init
```

### Transfer-sync（仅 WSL / Windows 生效）

```bash
aeksm transfer-sync
```

WSL 与 Windows 中心仓库双向对齐，以最新修改的一方为准，覆盖前自动备份。

配置项 `transferSyncBeforeGen: true` 默认开启，仅在 WSL/Windows 下生效，macOS/Linux 原生无此功能。

### Remove skills

```bash
aeksm remove <skill-name>...
aeksm remove --all
aeksm remove <skill-name>... --tools claude,cursor
```

从各工具目录移除指定 skill（支持多个名称），或清空全部。

### Interactive wizard

Run without arguments for a guided interactive setup:

```bash
aeksm
```

## Scopes

| Scope | Central repo path | Target paths |
|-------|------------------|--------------|
| Global (default) | `~/.aek/skill-manager/skills/` | `~/.<tool>/skills/` |
| Project | `.<cwd>/.aek/skill-manager/skills/` | `.<cwd>/.<tool>/skills/` |

## Supported Tools

`claude` · `claude-desktop` · `cherry-studio` · `chatbox` · `cline` · `codex` · `continue` · `copilot` · `cursor` · `gemini` · `hermes` · `opencode` · `openclaw` · `pi` · `qoder` · `qoder-cn` · `qwencode` · `antigravity` · `kiro` · `kilocode` · `vscode` · `windsurf` · `workbuddy` · `zcode` · `trae` · `trae-cn` · `deepseek-harness`

## 生成目标模式（genTargetMode）

`~/.aek/skill-manager/settings.yml` 的 `genTargetMode` 控制 skill 写到哪个目录：

- `2`（默认，原有逻辑）：每个工具都写自己的目录（`~/.<tool>/skills/`）。
- `1`：支持社区共用目录的 agent 只写厂商中立的 `~/.agents/skills`（项目级 `./.agents/skills`），其余工具仍写各自目录。`remove` 与 `gen` 走同一套目标解析，能对称清理。

共用目录 `~/.agents/skills`（项目 `.agents/skills`）是厂商中立约定（Codex 发起、`npx skills` 生态）。是否读、在哪个作用域读，由 `src/skills.js` 各平台的 `sharedAgentsDir` 标记决定：`true`/`'both'`＝全局+项目都读、`'project'`＝仅项目读、`'global'`＝仅全局读。

- A 全局+项目都读：`codex` · `cursor` · `vscode` · `copilot` · `gemini` · `opencode` · `windsurf` · `cline` · `pi` · `openclaw` · `deepseek-harness` · `qwencode` · `kilocode`
- B 仅项目级读 `.agents/skills`（全局 gen 仍走各自目录）：`hermes` · `antigravity` · `trae` · `trae-cn` · `kiro`
- C 不共用、写各自目录：`claude`、`claude-desktop`、`cherry-studio`、`chatbox`、`continue`、`qoder`、`qoder-cn`、`workbuddy`、`zcode`

> 判据：开源工具逐个 clone 源码 grep 核实（qwen `SKILL_PROVIDER_CONFIG_DIRS=['.qwen','.agents']`；hermes `PROJECT_SKILLS_SUBDIRS` 含 `.agents/skills`；opencode/cline/pi/gemini/kilocode 源码均有 `.agents`；claude 官方打包 grep 只见 plugin 的 `agents` 键、无 `.agents/skills`；continue 源码无 `.agents`）。Trae/Trae-CN 官方有“启用 .agents 技能目录”的项目级开关、Kiro 社区 issue 在加 `.agents/skills` 支持，故归 B（仅项目）。Qoder CN 自身系统提示词只认 `~/.qoder-cn`＋项目、不读 `~/.agents/skills`，归 C。误判成共用会把 skill 丢进没人读的目录，宁可保守；要覆盖某工具改其平台 `sharedAgentsDir` 即可。

## 性能优化

- 首次 gen 生成 `~/.aek/skill-manager/record.yml`，记录各工具最后同步时间
- 后续 gen 只检查 record 缓存，相同工具跳过，毫秒级完成
- 1 分钟内的重复调用会自动跳过 transfer-sync（避免 drvfs 慢写）
- `genDefaultTools` 只生成到必要 agent，避免无脑遍历 25 个平台

## 命名变更

`aeksm sync` 已改名为 `aeksm gen`（中心仓库 → 各工具是单向生成，不是双向同步）。旧名直接报错、不留别名。真正双向的 `transfer-sync` 名称不变。
