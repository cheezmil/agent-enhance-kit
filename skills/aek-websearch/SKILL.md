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

### MCP 服务器

基于 `mark3labs/mcp-go` v0.55.0 实现 Streamable HTTP 传输。

架构：CLI 和 MCP 共享 `internal/commands/` 包，MCP 工具与 CLI 子命令一一对应：

| MCP 工具 | 对应 CLI | 底层调用 |
|---|---|---|
| `web_search` | `aek websearch "query"` | `commands.Search()` |
| `web_extract` | `aek websearch extract "url"` | `commands.Extract()` |
| `web_code_search` | `aek websearch code-search "q"` | `commands.CodeSearch()` |
| `web_doctor` | `aek websearch doctor` | `commands.Doctor()` |
| `web_budgets` | `aek websearch budgets` | `commands.Budgets()` |
| `web_test_provider` | `aek websearch test-provider p` | `commands.TestProvider()` |
| `web_key_pool_status` | `aek websearch key-pool-status` | `commands.KeyPoolStatus()` |
| `web_key_pool_disable` | `aek websearch key-pool-disable` | `commands.KeyPoolDisable()` |
| `web_key_pool_enable` | `aek websearch key-pool-enable` | `commands.KeyPoolEnable()` |

Agent 客户端配置（Hermes / Cursor / Claude Desktop 等）：

```json
{
  "mcpServers": {
    "aek-websearch": {
      "url": "http://127.0.0.1:1350/mcp"
    }
  }
}
```

Health check: `GET /health`

### 配置文件
- 配置: `~/.aek/settings.jsonc`
- API Keys: `~/.aek/web-search/<provider>.txt`

### 安装到 Windows
```bash
python3 packages/aek-websearch/scripts/for-wsl/install-aek-to-windows.py
```

### 构建脚本（从项目根目录执行）
```bash
python3 packages/aek-websearch/scripts/start_build_aek-websearch.py       # 编译
python3 packages/aek-websearch/scripts/start_install_aek-websearch.py     # 安装到 Go bin
python3 packages/aek-websearch/scripts/start_aek-websearch.py             # 启动 serve
```