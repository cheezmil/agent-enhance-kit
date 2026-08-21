# AEK（Agent Enhance Kit）使用教程

AEK 是一套 AI/Agent 增强工具集，通过 npm 全局安装，一条命令多工具。

## 安装

```bash
npm install -g @cheezmil/aek
```

安装后获得 `aek` 命令。Go 二进制按平台自动匹配（esbuild 式平台分包，先发主包 + 5 个平台子包，npm 按 os/cpu 只装匹配的）。

> 旧版本（postinstall 时代）先卸载：`npm uninstall -g aek-websearch`（或其他旧包名）

## 命令一览

```bash
aek                          # 帮助（无参数默认显示 usage）
aek websearch <query>        # Web 搜索（多 provider）
aek websearch extract <url>  # 网页内容提取
aek websearch doctor         # 诊断
aek tm <command> [json]      # 任务管理器
aek mcp                      # MCP 服务器（启动后提供给 agent）
aek sm                       # Skill 同步工具（交互式，从中心仓库同步 skills 到 agent）
```

## 常用场景

### 1. 上网搜索

```bash
aek websearch "golang web frameworks 2026"
```

### 2. 网页内容提取

```bash
aek websearch extract "https://example.com"
```

### 3. 任务管理

```bash
aek tm create '{"title": "写周报", "priority": "high"}'
```

### 4. Skill 同步（默认交互式）

```bash
aek sm
```

也可以非交互：`aek sm --help` 查看参数。

### 5. MCP 服务器

```bash
aek mcp
```

启动后按 MCP 协议供 Claude/其他 agent 连接。

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

## 发布流程（维护者）

1. `pnpm changeset` 生成变更集
2. 提交推 main，CI 自动：changeset version（fixed 组联动平台子包版本）→ build-platform-bins.py 交叉编译 → pnpm changeset publish（拓扑序先平台子包后主包）
3. 也可本地发布：读 token 后 `pnpm publish --access public --no-git-checks`（在包目录内）

关键脚本：
- `scripts/for-maintainers/build-platform-bins.py` 交叉编译 15 个平台二进制
- `scripts/for-maintainers/sync-versions.py` 平台子包版本兜底同步
- `scripts/for-maintainers/release.py` 本地打 tag / GitHub Release

## 常见问题

- **`[aek tm] 未找到可执行二进制`**：npm 安装时平台子包未及时同步（registry 传播延迟），重装或等几分钟再 `npm install -g @cheezmil/aek`
- **`npm install` 报 Unsupported platform 警告**：optionalDependencies 平台过滤的正常提示，非错误
- **token 位置**：`D:\MyNotes\pw\npm\all-rights.txt`（npm access token）