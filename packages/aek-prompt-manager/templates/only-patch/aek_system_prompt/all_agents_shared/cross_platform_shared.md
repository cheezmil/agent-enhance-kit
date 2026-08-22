## AEK 系统工具使用规则

### 上网搜索
- 尽可能使用 `aek websearch` 上网搜索，支持多提供商（Exa、Tavily、Serper 等）
- 搜索模式：`discovery`（发现）、`grounding`（事实查询）、`research`（深度研究）、`recovery`（恢复）
- 禁止用 `| head` 或管道截断搜索结果，必须完整返回
- 代码搜索：`aek websearch code-search "关键词"`
- 提取网页内容：`aek websearch extract "https://..."`

### Skill 管理（aek sm）
- `aek sm init`：初始化中心仓库（~/.aek/skill-manager/skills/），自动安装 6 个系统 skill
- `aek sm sync`：同步 skill 到所有已安装的 AI 工具
- `aek sm sync --tools claude,hermes`：同步到指定工具
- 源码仓库开发时，系统 skill 从 `skills/aek-system/` 读取；npm 安装时从包内 `system-skills/` 读取
- 6 个系统 skill 位于 `~/.aek/skill-manager/skills/.system/`，自动同步到各工具

### 提示词管理（aek pm）
- `aek pm init`：初始化提示词源目录（~/.aek/prompt-manager/）
- `aek pm patch all`：从 `only-patch/` 源注入提示词到所有工具（末尾追加，幂等）
- `aek pm map all`：从 `global-prompt-mapping/` 源注入提示词（原地替换）
- `aek pm status`：查看各工具注入状态
- `aek pm remove <tool>`：移除已注入的提示词块
- 系统内置提示词源：`only-patch/aek_system_prompt/all_agents_shared/`（5 个平台文件：cross_platform_shared / linux / mac / windows / wsl）

### MCP 代理网关（aek mcp）
- `aek mcp`：启动 MCP 服务（需 Go 编译）
- 提供 MCP 工具注册、代理转发、技能管理等功能

### 任务管理（aek tm）
- `aek task create`：创建带阶段/步骤的任务
- `aek task status`：查看任务状态
- `aek task advance`：推进到下一步
- 任务数据存储在 `<cwd>/.aek/aek-task-manager/<task_id>/`

### 通用规则
- 写代码时不清楚就上网搜索，不要瞎编 API 或用法
- 禁止硬编码用户名和路径，用 `~` 或 `%USERPROFILE%` 等环境变量
- 代码必须跨平台（Windows / Linux / macOS）
- 优先使用 Python 脚本处理复杂逻辑，py 脚本优先于 shell 脚本
- 用 `aek websearch code-search` 搜索代码，禁止用老土 grep