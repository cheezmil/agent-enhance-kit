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

1. [Fork](https://github.com/cheezmil/agent-enhance-kit/fork) 本仓库到你的 GitHub（方便你提交PR，及时改进本项目，感谢你的使用）
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

#### 搜索提供商注册

有免费额度（需 API Key）：

| 提供商 | 免费额度 | 需要信用卡 | 注册地址 | 说明 |
|--------|----------|-----------|----------|------|
| Tavily | 1k次/月 | 否 | https://app.tavily.com/home | 注册即用，无需信用卡 |
| Exa | 1k次/月 | 否 | https://exa.ai/pricing | 注册后从 Dashboard 获取 API Key |
| Serper | 2.5k次一次性 | 否 | https://serper.dev/signup | 注册即用，无需信用卡 |
| You.com | $100一次性 | 否 | https://you.com/platform | 注册即送 $100 |
| Linkup | $20/月（≈4k次） | 否 | https://www.linkup.so/ | 注册即送 $20，每月刷新 |
| Parallel | 匿名免费 | 否 | https://platform.parallel.ai | 匿名也可用，注册后更高限额 |
| WolframAlpha | 2k次/月 | 否 | https://developer.wolframalpha.com/ | 需注册 Wolfram ID，获取 APP_ID |

#### 搜索提供商排行

基于实际使用测试（截至 2026-08-21）：

**Exa** > **Serper** > **Tavily** > 其他

> 想节约时间的话，直接用 **Exa** 即可，搜索质量和体验最佳。

*此排行反映个人实际测试体验，具有时效性，可能随时间变化。*

 ### 🔌 aek-mcp

使用方法： [`skills/aek-mcp/SKILL.md`](skills/aek-mcp/SKILL.md)

MCP 代理网关，集中管理所有 MCP 服务器的连接。

- **传输方式**：stdio / HTTP / SSE
- **Web 管理界面**：服务器管理、用户管理、分组管理、API 密钥、活动日志、提示词、资源
- **权限控制**：用户 → 分组 → 工具级细粒度访问控制

**服务器管理仪表盘** — 管理所有已连接的 MCP 服务器，按状态（在线 / 离线 / 已禁用）筛选，查看每个服务器的工具（Tools）、提示词（Prompts）、资源（Resources）及上下文占用。

![aek-mcp server management](static/aek-mcp/1.jpg)

**配置生成器** — 针对不同 AI 工具（如 Claude Code）自动生成并一键复制 MCP 配置，支持完整配置与内部片段两种 JSON 格式。

![aek-mcp tutorial config](static/aek-mcp/2.jpg)



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