---
name: aek-install-and-init
description: AEK 安装和初始化，其他包的详细用法不在此赘述，请查看对应包的 skill。
---

## 安装

```bash
npm install -g @cheezmil/aek
```

安装后获得 `aek` 命令。Go 二进制按平台自动匹配（esbuild 式平台分包，先发主包 + 5 个平台子包，npm 按 os/cpu 只装匹配的）。

> 旧版本（postinstall 时代）先卸载：`npm uninstall -g aek-websearch`（或其他旧包名）

## 升级

```bash
npm update -g @cheezmil/aek
```

## 单模块安装（可选）

不想装全家桶可以只装一个模块（会自动带 aek 垫片 + 平台二进制）：

```bash
npm install -g @cheezmil/aek-websearch    # 只装 web search
```

## 平台支持

- linux x64 / arm64
- macOS x64 / arm64
- Windows x64

其他平台安装会报"未找到可执行二进制"，提示安装对应主包（但平台子包未发布则无法安装）。

## 验证安装

```bash
aek version
aek --help
```

## 各包初始化

各包的详细用法请查看对应 skill：

| 包 | skill | 功能 |
|---|---|---|
| aek-websearch | `aek-websearch` | 搜索、提取、诊断 |
| aek-mcp | `aek-mcp` | MCP 代理网关 |
| aek-prompt-manager | `aek-prompt-manager` | 全局提示词注入 |
| aek-skill-manager | `aek-skill-manager` | 技能同步 |
| aek-task-manager | `aek-task-manager` | 任务管理 |

## 注意事项

- 各包子命令用法详见对应包名为名的 skill，本 skill 不重复描述
- 发布流程（tag、CI、npm publish）详见 `aek-release-workflow` skill