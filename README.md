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

---

## aek-mcp 使用教程

aek-mcp 是一个 MCP (Model Context Protocol) 代理网关，用 Go + Gin 编写。它可以统一管理多个 MCP 服务器（CTM、CTI、exa 等），通过一个端口对外暴露所有工具，并提供 Web 管理界面。

### 快速启动

```bash
# 构建
python3 scripts/aek-mcp/build-linux-x64.py

# 启动（默认端口 1351）
./packages/aek-mcp/bin/aek-mcp
```

启动后访问 `http://localhost:1351` 即可打开 Web 管理界面。

### 目录结构

```
~/.aek/mcp/
├── settings.jsonc        # 启动配置（端口、host、JWT 等）
├── mcp-settings.jsonc    # MCP 服务器配置（工具来源）
└── db/
    └── data.json         # 持久化数据（用户、服务器、分组等）
```

### settings.jsonc（启动配置）

```jsonc
{
  "port": 1351,           // 监听端口
  "host": "0.0.0.0",     // 监听地址
  "basePath": "",         // 路径前缀（反向代理时使用）
  "disableWeb": false,    // 是否禁用 Web 界面
  "jwtSecret": "mcphub-default-secret",  // JWT 签名密钥，建议修改
  "skipAuth": false       // 是否跳过认证（开发用）
}
```

也可通过环境变量覆盖：`PORT`、`HOST`、`BASE_PATH`、`DISABLE_WEB`、`JWT_SECRET`。

### mcp-settings.jsonc（MCP 服务器配置）

定义要连接的 MCP 服务器。格式为 `{ "服务器名": { ... } }`：

```jsonc
{
  "CTI": {
    "CTI": {
      "type": "streamable-http",
      "url": "http://localhost:1106/mcp"
    },
    "enabled": true
  },
  "exa": {
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server", "tools=get_code_context_exa,web_search_exa"],
      "env": {
        "EXA_API_KEY": "your-key"
      }
    },
    "enabled": true
  }
}
```

支持的传输类型：

| 类型 | 说明 | 配置字段 |
|------|------|----------|
| `streamable-http` | HTTP 流式传输（推荐） | `url` |
| `sse` | Server-Sent Events | `url` |
| `stdio` | 标准输入输出（本地进程） | `command` + `args` + `env` |

**注意：** `mcp-settings.jsonc` 中的服务器仅在 `data.json` 中不存在同名服务器时才会被导入，不会覆盖已有数据。

### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `admin` | admin |

首次登录后会收到修改默认密码的警告。

### API 接口

#### 认证

```bash
# 登录获取 token
curl -s -X POST http://localhost:1351/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 返回: {"success":true,"token":"eyJhb...","message":"Warning: ..."}
```

后续请求需带上 `Authorization: Bearer <token>` 头。

#### 服务器管理

```bash
# 列出所有服务器
curl -s http://localhost:1351/api/servers -H "Authorization: Bearer $TOKEN"

# 获取单个服务器
curl -s http://localhost:1351/api/servers/CTM -H "Authorization: Bearer $TOKEN"

# 创建服务器
curl -s -X POST http://localhost:1351/api/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-server","type":"streamable-http","url":"http://localhost:9000/mcp"}'

# 启用/禁用服务器
curl -s -X POST http://localhost:1351/api/servers/CTM/toggle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'
```

#### 工具调用

```bash
# 列出服务器的所有工具（从 MCP 服务器实时获取）
curl -s http://localhost:1351/api/tools/list/CTM -H "Authorization: Bearer $TOKEN"

# 调用工具
curl -s -X POST http://localhost:1351/api/tools/call/CTM \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "read_task_list",
    "arguments": {"workDir": "/home/user/my-project"}
  }'
```

返回格式：
```json
{
  "success": true,
  "data": {
    "content": [
      {"type": "text", "text": "工具返回的内容..."}
    ]
  }
}
```

#### 分组管理

```bash
# 创建分组
curl -s -X POST http://localhost:1351/api/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-group","description":"测试分组"}'

# 向分组添加服务器
curl -s -X POST http://localhost:1351/api/groups/<groupId>/servers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"servers":["CTM","CTI"]}'
```

#### 其他接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（无需认证） |
| GET | `/config` | 运行时配置 |
| POST | `/auth/register` | 注册新用户 |
| POST | `/auth/change-password` | 修改密码 |
| GET | `/api/users` | 用户列表 |
| GET | `/api/activities` | 活动日志 |
| GET | `/api/logs` | 系统日志 |
| GET | `/api/logs/stream` | SSE 日志流 |
| GET | `/api/settings` | 全量配置 |
| POST | `/api/templates/export` | 导出配置模板 |
| POST | `/api/templates/import` | 导入配置模板 |

### MCP 客户端连接

aek-mcp 启动时会自动连接 `mcp-settings.jsonc` 中所有 `enabled: true` 的 MCP 服务器。连接使用 `mcp-go` 库（`github.com/mark3labs/mcp-go`），支持：

- **MCP 协议握手**（initialize → notifications/initialized）
- **工具列表**（tools/list）
- **工具调用**（tools/call）

若连接失败，日志会输出 `[MCP] Failed to connect to xxx: ...`，但不影响其他服务器和 aek-mcp 自身运行。工具调用时会尝试自动重连。

### 构建

```bash
# Linux x64
python3 scripts/aek-mcp/build-linux-x64.py

# 或手动
cd packages/aek-mcp
pnpm install
cd frontend && pnpm run build && cd ..
go build -o bin/aek-mcp ./cmd/aek-mcp
```

构建产物 `bin/aek-mcp` 已加入 `.gitignore`。
