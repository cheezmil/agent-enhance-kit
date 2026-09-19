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

`aeksm sync` 时，下面 6 个系统 skill 会自动从 `~/.aek/skill-manager/aek-system-skill/` 同步到所有 AI 工具的 skills 目录：

| Skill | 包源码路径 | 说明 |
|-------|--------|------|
| `aek-install-and-init` | `packages/aek-skill-manager/aek-system-skill/` | 本 skill |
| `aek-mcp` | `packages/aek-mcp` | MCP 代理网关 |
| `aek-prompt-manager` | `packages/aek-prompt-manager` | 全局提示词注入 |
| `aek-skill-manager` | `packages/aek-skill-manager/aek-system-skill/` | Skill 同步 |
| `aek-task-manager` | `packages/aek-task-manager` | 长任务管理 |
| `aek-websearch` | `packages/aek-websearch` | 上网搜索 |

### 系统 skill 的来源

- **源码开发**（clone 本项目）：`aeksm init` / `aeksm sync` 从 `aek-system-skill/` 复制到中心仓库
- **npm 安装**：`@cheezmil/aek-skill-manager` 包内捆绑了系统 skill，`aeksm init` / `aeksm sync` 自动从包内读取

## 初始化（npm 安装后完整流程）

### 1. 初始化中心仓库 + 安装系统 skill

```bash
aeksm init
```

自动创建 `~/.aek/skill-manager/` 并复制系统 skill 到 `aek-system-skill/` 目录。

### 2. 初始化系统提示词注入源

```bash
aek pm init
```

创建 `~/.aek/prompt-manager/` 下的提示词源目录，包括 `only-patch/aek_system_prompt/all_agents_shared/`。

`aek_system_prompt/all_agents_shared/cross_platform_shared.md` 已有默认内容（AEK 各工具使用规则），**开箱即用**，无需手动编辑。按需可补充 `linux.md` / `mac.md` / `windows.md` / `wsl.md` 平台差异化内容。

### 3. 注入系统提示词到所有工具

```bash
aek pm patch all    # 末尾追加（only-patch 源），幂等
```

从 `only-patch/aek_system_prompt/all_agents_shared/` 读取默认 AEK 系统提示词，注入到所有 25 个工具的全局提示词文件。

### 4. 同步 skill 到工具

默认只同步 `settings.jsonc` 中 `syncDefaultTools` 配置的 agent（推荐：`hermes` + `deepseek-harness`）：

```bash
aeksm sync
```

同步全部支持的 agent：

```bash
aeksm sync --allagents
```

### 5. 验证状态

```bash
aek pm status       # 各工具 patched / not-patched
aeksm sync         # 查看同步结果（秒完成）
cat ~/.aek/skill-manager/record.jsonc  # 各工具最后同步时间
tail ~/.aek/skill-manager/log.txt     # 同步日志
```

## 生效条件

要使 AEK 系统被 AI 有效使用，必须同时满足两个条件：

1. **系统 skill 生效**：6 个系统 skill 在中心仓库中，且 `aeksm sync` 已同步到各工具
2. **系统提示词生效**：`aek pm patch all` 成功执行，注入后的提示词文件包含 `head-aek-system-built-in-prompt` 标记块

## 关键文件路径

| 用途 | 路径 |
|------|------|
| 中心仓库 | `~/.aek/skill-manager/skills/` |
| 系统 skill 源（源码开发） | `~/.aek/skill-manager/aek-system-skill/` |
| 提示词源（only-patch） | `~/.aek/prompt-manager/only-patch/` |
| 系统内置提示词 | `~/.aek/prompt-manager/only-patch/aek_system_prompt/all_agents_shared/` |
| 同步记录 | `~/.aek/skill-manager/record.jsonc` |
| 同步日志 | `~/.aek/skill-manager/log.txt` |
| 配置文件 | `~/.aek/skill-manager/settings.jsonc` |
| 包内捆绑系统 skill（npm） | `node_modules/@cheezmil/aek-skill-manager/aek-system-skill/` |
| 系统提示词模板（npm） | `node_modules/@cheezmil/aek-prompt-manager/templates/only-patch/aek_system_prompt/all_agents_shared/` |

## 升级

```bash
npm update -g @cheezmil/aek
```

升级后重新运行 `aeksm sync` 以确保系统 skill 为最新版本，运行 `aek pm patch all` 更新系统提示词。

## 平台支持

linux x64/arm64, macOS x64/arm64, Windows x64, WSL2。
