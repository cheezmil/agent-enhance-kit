---
name: aek-websearch
description: Use when using AEK's web search package — multi-provider search CLI, HTTP API, and MCP Server.
license: MIT
metadata:
  hermes:
    tags: [aek, search, mcp, web]
---

# aek-websearch

## Overview

Multi-provider web search aggregation engine with a unified interface and automatic failover.

## When to Use

- Need to run web search from CLI or API
- Need to start or deploy the search service
- Need to configure search providers

## Usage

### Start

```bash
python3 packages/aek-websearch/scripts/start_aek-websearch.py
```

### Deploy (build + install)

```bash
python3 packages/aek-websearch/scripts/start_deploy_aek-websearch.py
```

### Install dependencies

```bash
python3 packages/aek-websearch/scripts/start_install_dependencies_aek-websearch.py
```

### CLI

```bash
aek search <query>
aek serve
```

### Supported Providers

`Exa` · `Tavily` · `Serper` · `DuckDuckGo` · `Yahoo` · `You.com` · `Linkup` · `Wolfram Alpha` · `Context7`

## Common Pitfalls

- Run `start_deploy` first to build the binary before `start`
- Providers requiring API keys must be configured before use
- Ensure Go 1.26+ is installed

## Verification

- `aek serve` responds on the configured port
- `aek search "test"` returns results