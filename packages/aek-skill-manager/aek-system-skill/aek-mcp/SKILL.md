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

## Usage

### Start (frontend + backend)

```bash
python3 packages/aek-mcp/scripts/start_aek-mcp.py
```

### Start frontend only

```bash
python3 packages/aek-mcp/scripts/start_fe_aek-mcp.py
```

### Start backend only

```bash
python3 packages/aek-mcp/scripts/start_be_aek-mcp.py
```

### Deploy (build + install)

```bash
# Deploy both
python3 packages/aek-mcp/scripts/start_deploy_aek-mcp.py

# Deploy frontend only
python3 packages/aek-mcp/scripts/start_deploy_fe_aek-mcp.py

# Deploy backend only
python3 packages/aek-mcp/scripts/start_deploy_be_aek-mcp.py
```

### Install dependencies

```bash
python3 packages/aek-mcp/scripts/start_install_dependencies_aek-mcp.py
```

### Web UI Features
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
- Run `start_deploy` before `start` to build
- Check logs via Web UI if connections fail

## Verification

- Web UI accessible on port 1351
- Backend API responds on port 1352
- MCP servers connect and respond to tool calls