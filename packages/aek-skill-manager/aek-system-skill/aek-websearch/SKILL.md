---
name: aek-websearch
description: AEK Web Search CLI 使用方法，用于上网搜索、代码搜索。
---

## AEK Web Search CLI

AEK 是一个独立的多提供商搜索代理 CLI 工具。

### 核心命令

```bash
# 搜索
aek websearch "搜索关键词"

# 搜索模式
aek websearch "query" -m discovery    # 发现模式（默认）
aek websearch "query" -m grounding    # 事实查询
aek websearch "query" -m research     # 深度研究
aek websearch "query" -m recovery     # 恢复模式

# 指定提供商
aek websearch "query" -p exa,tavily,serper

# 仅用免费提供商
aek websearch "query" --free

# JSON 输出
aek websearch "query" --json

# 多轮会话
aek websearch "query" -s session123
```

### 子命令

```bash
# 诊断环境
aek websearch doctor

# 提取网页内容
aek websearch extract "https://example.com"

# 代码搜索
aek websearch code-search "react hooks example"

# 查看预算
aek websearch budgets

# 测试单个提供商
aek websearch test-provider exa

# API Key 管理
aek websearch key-pool-status
aek websearch key-pool-disable <provider> <index>
aek websearch key-pool-enable <provider> <index>
```

### 服务模式

```bash
# 启动 HTTP 服务（端口见 ~/.aek/settings.jsonc）
aek serve

# 启动 MCP 服务
aek mcp
```

### 配置文件
- 配置: `~/.aek/settings.jsonc`
- API Keys: `~/.aek/web-search/<provider>.txt`

### 构建与部署（统一入口：scripts/build_deploy.py）

```bash
# 构建本机 + 对端平台二进制（WSL 自动编译 linux + windows）
python3 scripts/build_deploy.py aek-websearch --no-deploy

# 交叉编译全部 5 个平台（CI/维护者用）
python3 scripts/build_deploy.py --build-platform-bins --cross-compile --build-platform-bin-short aek-websearch

# 同步平台子包版本号到主包版本
python3 scripts/build_deploy.py --sync-versions

# 完整部署（构建 + npm install -g + 对端同步）
python3 scripts/build_deploy.py aek-websearch
```

### 启动服务

```bash
# 启动 websearch 服务
python3 scripts/start.py websearch

# 列出所有可用服务
python3 scripts/start.py --list
```

### 注意事项

- **禁止使用 `| head` 或其他管道截断搜索结果**：搜索结果必须完整返回，由 agent 自己处理筛选。使用 `| head` 会丢失重要信息。
- **写代码时不会或不清楚就上网搜**：不要卡住或瞎编，直接上网搜。
