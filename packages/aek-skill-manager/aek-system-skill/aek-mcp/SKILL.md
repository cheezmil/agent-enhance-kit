---
name: aek-mcp
description: Use when using AEK's MCP gateway — proxy, Web management UI, server management, and permissions.
license: MIT
metadata:
  hermes:
    tags: [aek, mcp, proxy, web-ui]
---

# aek-mcp

## Overview

MCP proxy gateway for centralized management of all MCP server connections. Supports stdio / HTTP / SSE transports.

## When to Use

- Need to manage MCP servers via a unified gateway
- Need to start or deploy the MCP gateway
- Need to manage servers, users, groups, or API keys via Web UI
- Need to configure permissions

## 构建与部署（统一入口：scripts/build_deploy.py）

```bash
# 构建本机 + 对端平台二进制（WSL 自动编译 linux + windows）
python3 scripts/build_deploy.py aek-mcp --no-deploy

# 完整部署（构建 + npm install -g + 对端同步）
python3 scripts/build_deploy.py aek-mcp

# 交叉编译全部 5 个平台
python3 scripts/build_deploy.py --build-platform-bins --cross-compile
```

## 启动服务

```bash
# 启动 MCP 全部服务（backend + frontend）
python3 scripts/start.py mcp

# 仅启动后端（gin, port 1352）
python3 scripts/start.py mcp-backend

# dev 模式（热重载）
python3 scripts/start.py mcp --dev

# 列出所有可用服务
python3 scripts/start.py --list
```

### 服务端口
- Backend (gin): `:1352`
- Frontend (nextjs): `:1351`

## Web UI Features
- Dashboard
- Server management
- User & group management
- API keys
- Activity logs
- Logs
- Prompts & resources
- Tutorial (MCP client config generator)
- Tool-level permissions (Settings)

## Common Pitfalls

- Frontend (1351) and backend (1352) must both be running
- Run `build_deploy.py` before `start.py` to build
- Check logs via Web UI if connections fail

## Verification

- Web UI accessible on port 1351
- Backend API responds on port 1352
- MCP servers connect and respond to tool calls
