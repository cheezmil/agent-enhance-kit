# Agent Enhance Kit (AEK)

AI 代理增强工具集。

## 包

| 包 | 说明 |
|----|------|
| `aek-mcp` | MCP 代理网关，支持 stdio/http/sse 传输，Web 管理界面 |
| `aek-websearch` | 多提供商网页搜索，CLI + HTTP API |

## 直接使用（无需 clone）

已安装 aek 的用户可以直接使用：

```bash
# 搜索
aek websearch "your query"

# 提取网页内容
aek websearch extract "https://example.com"

# 诊断 provider 状态
aek websearch doctor

# MCP 服务（需单独启动）
aek-mcp --port 1351
```

## 开发者（clone 后）

```bash
git clone <repo-url>

# 构建全部
python3 scripts/build-all.py

# 构建单个包
python3 scripts/aek-websearch/build-linux-x64.py
python3 scripts/aek-mcp/build-linux-x64.py

# 测试
python3 scripts/test-all.py
```

## 配置

| 文件 | 说明 |
|------|------|
| `~/.aek/mcp/mcp-settings.jsonc` | MCP 服务配置 |
| `~/.aek/mcp/settings.jsonc` | 系统配置（端口、密钥等） |
| `~/.aek/websearch/websearch-settings.jsonc` | 网页搜索配置 |
