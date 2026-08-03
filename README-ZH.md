<div align="center">

<img width="120px" alt="AEK Logo" src="static/aek-logo.svg">

<a name="readme-top"></a>

# Agent Enhance Kit (AEK)

AI Agent 基础设施 monorepo —— 多提供商搜索、MCP 代理网关、Web 管理界面

[![Go version][go_version_img]][go_dev_url]
[![License][repo_license_img]][repo_license_url]
[![GitHub][github_img]][github_url]

**&searr;&nbsp;&nbsp;其他语言&nbsp;&nbsp;&swarr;**

[English](README.md) · [简体中文](README-ZH.md)

</div>

Agent Enhance Kit 是一个 **monorepo**

| 包 | 说明 |
|----|------|
| [`aek-websearch`](packages/aek-websearch) | 多提供商网页搜索聚合引擎：CLI + HTTP API + MCP Server |
| [`aek-mcp`](packages/aek-mcp) | MCP 代理网关 + Web 管理界面（Next.js 前端 + Go 后端） |

---

### 🔍 aek-websearch

多提供商搜索聚合，统一接口，自动故障转移。

```
aek search <query>                    # CLI 搜索
aek serve                             # 启动 HTTP API 服务
```

支持的搜索提供商：
`Exa` · `Tavily` · `Serper` · `DuckDuckGo` · `Yahoo` · `You.com` · `Linkup` · `Wolfram Alpha` · `Context7`

### 🔌 aek-mcp

MCP 代理网关，集中管理所有 MCP 服务器连接。

- **传输协议**：stdio / HTTP / SSE
- **Web 管理界面**：服务器管理、用户管理、分组管理、密钥管理、活动日志、Prompt 管理、资源管理
- **权限控制**：用户 → 分组 → 工具级别权限，细粒度控制
- **MCP 市场**：浏览并一键添加社区 MCP 服务器

---



<!-- 链接 -->

[go_version_img]: https://img.shields.io/badge/Go-1.26+-00ADD8?style=for-the-badge&logo=go
[go_dev_url]: https://pkg.go.dev/github.com/cheezmil/agent-enhance-kit
[repo_license_url]: https://github.com/cheezmil/agent-enhance-kit/blob/main/LICENSE
[repo_license_img]: https://img.shields.io/badge/license-MIT-green?style=for-the-badge&logo=none
[github_img]: https://img.shields.io/badge/github-181717?style=for-the-badge&logo=github
[github_url]: https://github.com/cheezmil/agent-enhance-kit