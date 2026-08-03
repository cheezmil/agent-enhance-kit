<div align="center">

<img width="120px" alt="AEK Logo" src="static/aek-logo.svg">

<a name="readme-top"></a>

# Agent Enhance Kit (AEK)

AI Agent infrastructure monorepo — multi-provider search, MCP proxy gateway, Web management UI

[![Go version][go_version_img]][go_dev_url]
[![License][repo_license_img]][repo_license_url]
[![GitHub][github_img]][github_url]

**&searr;&nbsp;&nbsp;Read this in other languages&nbsp;&nbsp;&swarr;**

[English](README.md) · [简体中文](README-ZH.md)

</div>

Agent Enhance Kit is a **Go monorepo** containing two standalone packages:

| Package | Description |
|---------|-------------|
| [`aek-websearch`](packages/aek-websearch) | Multi-provider web search engine: CLI + HTTP API + MCP Server |
| [`aek-mcp`](packages/aek-mcp) | MCP proxy gateway + Web management UI (Next.js frontend + Go backend) |

---

### 🔍 aek-websearch

Multi-provider search aggregation with a unified interface and automatic failover.

```
aek search <query>                    # CLI search
aek serve                             # Start HTTP API server
```

Supported search providers:
`Exa` · `Tavily` · `Serper` · `DuckDuckGo` · `Yahoo` · `You.com` · `Linkup` · `Wolfram Alpha` · `Context7`

### 🔌 aek-mcp

MCP proxy gateway for centralized management of all MCP server connections.

- **Transports**: stdio / HTTP / SSE
- **Web management UI**: Server management, user management, group management, API keys, activity logs, prompts, resources
- **Permissions**: User → group → tool-level granular access control
- **MCP marketplace**: Browse and add community MCP servers with one click

---

## 🏆 Project goals

As AI Agents evolve rapidly, MCP server management and multi-provider search integration are often fragmented.

**Agent Enhance Kit** aims to provide a ready-to-use infrastructure that lets developers:
1. Manage all MCP server connections through a unified gateway
2. Aggregate multiple search providers to avoid single points of failure
3. Reduce operational overhead with a visual Web configuration UI

## ⚠️ License

[`Agent Enhance Kit`][github_url] is open-sourced under the [MIT license][repo_license_url].

<!-- Links -->

[go_version_img]: https://img.shields.io/badge/Go-1.26+-00ADD8?style=for-the-badge&logo=go
[go_dev_url]: https://pkg.go.dev/github.com/cheezmil/agent-enhance-kit
[repo_license_url]: https://github.com/cheezmil/agent-enhance-kit/blob/main/LICENSE
[repo_license_img]: https://img.shields.io/badge/license-MIT-green?style=for-the-badge&logo=none
[github_img]: https://img.shields.io/badge/github-181717?style=for-the-badge&logo=github
[github_url]: https://github.com/cheezmil/agent-enhance-kit