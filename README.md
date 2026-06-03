# AEK — Agent Enhance Kit

[![Go 1.26+](https://img.shields.io/badge/Go-1.26+-blue)](https://go.dev/dl/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

AI 代理搜索基础设施。多提供商路由、并发搜索、会话管理、内容提取，一行命令启动。

## 特性

- **多提供商搜索** — DuckDuckGo、Yahoo、Mock，可扩展
- **并发执行** — goroutine + WaitGroup 并发调用所有 provider
- **RRF 排序** — Reciprocal Rank Fusion 融合多源结果
- **会话管理** — `session_id` 支持多轮对话上下文
- **JSON 持久化** — sessions/budgets 自动落盘，重启不丢
- **Gin HTTP API** — `/api/search`、`/api/extract`、`/api/health`
- **Cobra CLI** — `aek serve`、`aek mcp`、`aek version`
- **认证中间件** — caller/admin 分层鉴权，本地访问自动放行
- **限流** — 内存限流中间件，返回 429
- **Docker** — 多阶段构建，`docker compose up -d` 即可部署

## 快速开始

```bash
# 本地运行
go run ./cmd/aek serve

# 或编译
go build -o aek ./cmd/aek
./aek serve

# Docker
docker compose up -d --build
```

默认监听 `127.0.0.1:8000`。

## API

### 搜索

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "golang web framework", "mode": "discovery", "max_results": 5}'
```

支持 `session_id` 多轮对话：

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "tell me more", "session_id": "my-session"}'
```

### 提取

```bash
curl -X POST http://localhost:8000/api/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'
```

### 健康检查

```bash
curl http://localhost:8000/api/health
```

### 管理接口

需要 `ARGUS_ADMIN_API_KEY`：

```bash
curl -H "Authorization: Bearer $ARGUS_ADMIN_API_KEY" \
  http://localhost:8000/api/admin/health/detail

curl -H "Authorization: Bearer $ARGUS_ADMIN_API_KEY" \
  http://localhost:8000/api/admin/budgets
```

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `ARGUS_PORT` | `8000` | 监听端口 |
| `ARGUS_BIND_HOST` | `127.0.0.1` | 监听地址 |
| `ARGUS_ENV` | `development` | 运行环境 |
| `ARGUS_API_KEY` | — | 普通接口鉴权 key |
| `ARGUS_ADMIN_API_KEY` | — | 管理接口鉴权 key |

## CLI

```bash
aek serve          # 启动 HTTP 服务
aek mcp            # 启动 MCP 服务（占位）
aek version        # 打印版本
```

## 项目结构

```
agent-enhance-kit/
├── cmd/aek/                # CLI 入口
├── internal/
│   ├── api/                # Gin 路由 + 中间件
│   ├── auth/               # 认证逻辑
│   ├── broker/             # 搜索代理、路由、缓存、预算
│   ├── config/             # 配置加载
│   ├── corpus/             # 语料库路径
│   ├── diagnostics/        # 诊断
│   ├── egress/             # 拓扑感知（占位）
│   ├── extraction/         # 内容提取器链
│   ├── health/             # 健康检查
│   ├── logging/            # 日志
│   ├── mcp/                # MCP 服务
│   ├── models/             # 数据模型
│   ├── monitoring/         # 监控（占位）
│   ├── persistence/        # JSON 持久化
│   ├── providers/          # 搜索提供商适配器
│   ├── quality/            # 质量门控
│   ├── ratelimit/          # 限流
│   ├── recovery/           # 死链恢复（占位）
│   ├── sessions/           # 会话管理
│   └── workflows/          # 工作流（占位）
├── Dockerfile
├── docker-compose.yml
└── go.mod
```

## 添加新 Provider

实现 `providers.Provider` 接口即可：

```go
type Provider interface {
    Name() models.ProviderName
    IsAvailable() bool
    Status() models.ProviderStatus
    Search(query models.SearchQuery) ([]models.SearchResult, models.ProviderTrace, error)
}
```

然后在 `internal/api/server.go` 中注册：

```go
b.RegisterProvider(providers.NewYourProvider())
```

## 开发

```bash
go test ./...
go build ./cmd/aek
```

## License

MIT
