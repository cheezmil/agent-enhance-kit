<div align="center">

<img width="120px" alt="AEK Logo" src="static/aek-logo.svg">

<a name="readme-top"></a>

# Agent Enhance Kit (AEK)

AI Agent 增强提效工具

[![Go version][go_version_img]][go_dev_url]
[![Go report][go_report_img]][go_report_url]
[![License][repo_license_img]][repo_license_url]

**&searr;&nbsp;&nbsp;其他语言&nbsp;&nbsp;&swarr;**

[English](README.md) · [简体中文](README-ZH.md)

</div>

Agent Enhance Kit 是一个 **monorepo**

| 包 | 说明 |
|----|------|
| [`aek-websearch`](packages/aek-websearch) | 多提供商网页搜索聚合引擎：CLI + HTTP API + MCP Server |
| [`aek-mcp`](packages/aek-mcp) | MCP 代理网关 + Web 管理界面（Next.js 前端 + Go 后端） |

## 🚀 快速上手

1. [Fork](https://github.com/cheezmil/agent-enhance-kit/fork) 本仓库到你的 GitHub（方便你提交PR，及时改进本项目）
2. Clone 你 fork 的仓库：
   ```bash
   git clone https://github.com/<你的用户名>/agent-enhance-kit.git
   cd agent-enhance-kit
   ```
3. 用你的 AI 编程工具（Cursor、Claude Code、Hermes 等）打开项目
4. 向Agent询问“这个项目是什么、怎么用、帮我安装使用本项目”，Agent将帮你搞定。


---

### 🔍 aek-websearch

使用方法： [`skills/aek-websearch/SKILL.md`](skills/aek-websearch/SKILL.md)

多提供商搜索聚合，统一接口，自动故障转移。

支持的搜索提供商：
`Exa` · `Tavily` · `Serper` · `DuckDuckGo` · `Yahoo` · `You.com` · `Linkup` · `Wolfram Alpha` · `Context7`

### 🔌 aek-mcp

使用方法： [`skills/aek-mcp/SKILL.md`](skills/aek-mcp/SKILL.md)

MCP 代理网关，集中管理所有 MCP 服务器连接。

- **传输协议**：stdio / HTTP / SSE
- **Web 管理界面**：服务器管理、用户管理、分组管理、密钥管理、活动日志、Prompt 管理、资源管理
- **权限控制**：用户 → 分组 → 工具级别权限，细粒度控制
- **MCP 市场**：浏览并一键添加社区 MCP 服务器

---

<!-- 链接 -->

[go_version_img]: https://img.shields.io/badge/Go-1.26+-00ADD8?style=for-the-badge&logo=go
[go_dev_url]: https://pkg.go.dev/github.com/cheezmil/agent-enhance-kit
[go_report_img]: https://img.shields.io/badge/Go_report-A+-success?style=for-the-badge&logo=none
[go_report_url]: https://goreportcard.com/report/github.com/cheezmil/agent-enhance-kit
[repo_license_url]: https://github.com/cheezmil/agent-enhance-kit/blob/main/LICENSE
[repo_license_img]: https://img.shields.io/badge/license-MIT-green?style=for-the-badge&logo=none
[github_img]: https://img.shields.io/badge/github-181717?style=for-the-badge&logo=github
[github_url]: https://github.com/cheezmil/agent-enhance-kit