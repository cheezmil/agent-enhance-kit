---
name: aek-install-and-init
description: AEK 安装、初始化、系统 skill 设置与系统提示词注入，其他包用法请查看对应包名的 skill。
---

## 安装

```bash
npm install -g @cheezmil/aek            # 全家桶（含所有子包）
npm install -g @cheezmil/aek-websearch  # 单模块（自动带 aek 垫片 + 平台二进制）
```

## 必装系统 skill（6 个）

`aek sm sync` 时，下面 6 个系统 skill 会自动从 `~/.aek/skill-manager/skills/.system/` 同步到所有 AI 工具的 skills 目录：

| Skill | 包源码路径 | 说明 |
|-------|--------|------|
| `aek-install-and-init` | `packages/aek-skill-manager`(CLI) | 本 skill |
| `aek-mcp` | `packages/aek-mcp` | MCP 代理网关 |
| `aek-prompt-manager` | `packages/aek-prompt-manager` | 全局提示词注入 |
| `aek-skill-manager` | `packages/aek-skill-manager` | Skill 同步 |
| `aek-task-manager` | `packages/aek-task-manager` | 长任务管理 |
| `aek-websearch` | `packages/aek-websearch` | 上网搜索 |

### 系统 skill 的来源

- **源码开发**（clone 本项目）：`aek sm init` / `aek sm sync` 从 `skills/aek-system/` 复制到 `~/.aek/skill-manager/skills/.system/`
- **npm 安装**：`@cheezmil/aek-skill-manager` 包内捆绑了 `system-skills/`，`aek sm init` / `aek sm sync` 自动从包内读取

## 初始化

### 1. 初始化中心仓库 + 安装系统 skill

```bash
aek sm init
```

自动创建 `~/.aek/skill-manager/skills/` 并复制 6 个系统 skill 到 `.system/` 子目录。

### 2. 添加其他 skill 并同步到所有工具

把自行编写的 SKILL.md 文件夹放到 `~/.aek/skill-manager/skills/` 下，然后：

```bash
aek sm sync
```

同步到所有已安装的 AI 工具（Claude Code、Codex、OpenCode、Cursor、Hermes 等）。

### 3. 初始化系统提示词注入源

```bash
aek pm init
```

创建 `~/.aek/prompt-manager/` 下的提示词源目录，包括 `only-patch/aek_system_prompt/all_agents_shared/`（系统内置提示词）。

### 4. 写入系统提示词内容

编辑 `~/.aek/prompt-manager/only-patch/aek_system_prompt/all_agents_shared/cross_platform_shared.md`，写入全局生效的系统提示词。

按需补充 `linux.md` / `mac.md` / `windows.md` / `wsl.md` 平台差异化内容。

### 5. 注入系统提示词到所有工具

```bash
aek pm patch all    # 末尾追加（only-patch 源），幂等
```

或：

```bash
aek pm apply all    # patch 的别名
```

### 6. 验证状态

```bash
aek pm status       # 各工具 patched / not-patched
aek pm status hermes  # 查看单个工具
```

## 生效条件

要使 AEK 系统被 AI 有效使用，必须同时满足两个条件：

1. **系统 skill 生效**：6 个系统 skill 在 `~/.aek/skill-manager/skills/.system/` 中，且 `aek sm sync` 已同步到各工具
2. **系统提示词生效**：`aek pm patch all` 成功执行，注入后的提示词文件包含 `head-aek-system-built-in-prompt` 标记块

## 关键文件路径

| 用途 | 路径 |
|------|------|
| 中心仓库 | `~/.aek/skill-manager/skills/` |
| 系统 skill（.system） | `~/.aek/skill-manager/skills/.system/` |
| 提示词源（only-patch） | `~/.aek/prompt-manager/only-patch/` |
| 系统内置提示词 | `~/.aek/prompt-manager/only-patch/aek_system_prompt/all_agents_shared/` |
| 提示词源（mapping） | `~/.aek/prompt-manager/global-prompt-mapping/` |

## 升级

```bash
npm update -g @cheezmil/aek
```

升级后重新运行 `aek sm sync` 以确保系统 skill 为最新版本。

## 平台支持

linux x64/arm64, macOS x64/arm64, Windows x64。