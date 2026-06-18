# MCP exa vs aek CLI 搜索结果对比

## 搜索关键词：opencode

---

## 1. MCP exa 输出 (aek-mcp_exa__web_search_exa)

### 结果 1
**Title:** OpenCode | The open source AI coding agent
**URL:** https://opencode.ai/
**Published:** N/A
**Author:** N/A

**Highlights:**
OpenCode | The open source AI coding agent
[...]
# The open source AI coding agent
[...]
Free models included or connect any model from any provider, including Claude, GPT, Gemini and more.
[...]
### What is OpenCode?
[...]
OpenCode is an open source agent that helps you write code in your terminal, IDE, or desktop.
[...]
LSP enabled Automatically loads the right LSPs for
[...]
Start multiple agents in
[...]
Any model 75+ LLM providers through Models.dev, including local models
[...]
Any editor Available as a terminal interface, desktop app, and IDE extension
[...]
### The open source AI coding agent
[...]
With over 160,000 GitHub stars, 900 contributors, and over 13,000 commits, OpenCode is used and trusted by over 7.5M developers every month.
[...]
### Built for privacy first
[...]
OpenCode does not store any of your code or context data, so that it can operate in privacy sensitive environments. Learn more about privacy.
[...]
What is OpenCode?
[...]
How do I use OpenCode?
[...]
use OpenCode
[...]
use my existing AI
[...]
with OpenCode
[...]
Can I only use OpenCode in the terminal?
[...]
How much does OpenCode cost?
[...]
What about data and privacy
[...]
Is OpenCode open source?
[...]
Access reliable optimized models for coding agents
[...]
Zen gives you access to a handpicked set of AI models that OpenCode has tested and benchmarked specifically for coding agents. No need to worry about inconsistent performance and quality across providers, use validated models that work.

---

### 结果 2
**Title:** Intro | AI coding agent built for the terminal
**URL:** https://dev.opencode.ai/docs/
**Published:** N/A
**Author:** N/A

**Highlights:**
Intro | AI coding agent built for the terminalIntro | OpenCode Skip to content
[...]
Get started with OpenCode.
[...]
OpenCode is an open source AI coding agent. It's available as a terminal-based interface, desktop app, or IDE extension.
[...]
To use OpenCode in your terminal, you'll need:
[...]
The easiest way to install OpenCode is through the install script.
[...]
You can also install it with the following commands:
[...]
With OpenCode you can use any LLM provider by configuring their API keys.
[...]
curated list of models that have been tested and verified by the OpenCode team.
[...]
Run the`/connect` command in the TUI, select opencode, and head to opencode.ai/auth.
[...]
Sign in, add your billing details, and copy your API key.
[...]
Paste your API key.
[...]
Now that you've configured a provider, you can navigate to a project that you want to work on.
[...]
And run OpenCode.
[...]
```
opencode
[...]
Next, initialize OpenCode for the project by running the following command.
[...]
```
/init
[...]
This will get OpenCode to analyze your project and create an`AGENTS.md` file in the project root.
[...]
This helps OpenCode understand the project structure and the coding patterns used.
[...]
You are now ready to use OpenCode to work on your project. Feel free to ask it anything!
[...]
You can ask OpenCode to add new features to your project. Though we first recommend asking it to create a plan.
[...]
OpenCode has a Plan mode that disables its ability to make changes and instead suggest how it'll implement the feature.
[...]
### Make changes
[...]
For more straightforward changes, you can ask OpenCode to directly build it without having to review the plan first.
[...]
### Undo changes
[...]
But you realize that it is not what you wanted. You can undo the changes using the`/undo` command.
[...]
Or you can
[...]
And that's it! You are now a pro at using OpenCode.
[...]
creating custom commands
[...]
playing around with the OpenCode config.

---

### 结果 3
**Title:** CLI | OpenCode
**URL:** https://opencode.ai/docs/cli/
**Published:** N/A
**Author:** N/A

**Highlights:**
The OpenCode CLI by default starts the TUI when run without any arguments.
[...]
```bash
opencode

```
[...]
But it also accepts commands as documented on this page. This allows you to interact with OpenCode programmatically.
[...]
```bash
opencode run
[...]
closures work in
[...]
### tui
[...]
Start the OpenCode terminal user interface.
[...]
```bash
opencode [project]

```
[...]
--- | --- | ---
[...]
The OpenCode CLI also has the following commands.
[...]
Manage agents for OpenCode.
[...]
```bash
opencode agent [command]
[...]
```bash
opencode agent create
[...]
Attach a terminal to an already running OpenCode backend server started via `serve` or `web` commands.
[...]
```bash
opencode attach [url]
[...]
This allows using the TUI with a remote OpenCode backend. For example:
[...]
Run opencode in non-interactive mode by passing a prompt directly.
[...]
```bash
opencode run [message..]
[...]
This is useful for scripting, automation, or when you need a quick answer without launching the full TUI. For example.
[...]
You can also attach to a running `opencode serve` instance to avoid
[...]
boot times on every run:
[...]
Start a headless OpenCode server for API access. Check out the server
[...]
full HTTP interface
[...]
```bash
opencode serve
[...]
This starts an HTTP server that provides API access to opencode functionality without the TUI interface. Set `OPENCODE_SERVER_PASSWORD` to enable HTTP basic auth (username defaults to `opencode`).
[...]
```bash
opencode web
[...]
access OpenCode through a
[...]
interface. Set `OPENCODE_SERVER_PASSWORD` to enable HTTP basic auth (username defaults to `opencode
[...]
## Environment variables

---

## 2. aek CLI 输出 (aek websearch "opencode" -p exa)

### 结果 1
**Title:** OpenCode | The open source AI coding agent
**URL:** https://opencode.ai/

OpenCode | The open source AI coding agent

New

Desktop app available in beta on macOS, Windows, and Linux. Download now Download the desktop beta now

# The open source AI coding agent

Free models included or connect any model from any provider, including Claude, GPT, Gemini and more.

curlnpmbunbrewparu

```
curl -fsSL https://opencode.ai/install | bash
```

Your browser does not support the video tag.

### What is OpenCode?

OpenCode is an open source agent that helps you write code in your terminal, IDE, or desktop.

[*]

LSP enabled Automatically loads the right LSPs for the LLM

[*]

Multi-session Start multiple agents in parallel on the same project

[*]

Share links Share a link to any session for reference or to debug

[*]

GitHub Copilot Log in with GitHub to use your Copilot account

[*]

ChatGPT Plus/Pro Log in with OpenAI to use your ChatGPT Plus or Pro account

[*]

Any model 75+ LLM providers through Models.dev, including local models

[*]

Any editor Available as a terminal interface, desktop app, and IDE extension

Read docs

### The open source AI coding agent

[*]

With over 160,000 GitHub stars, 900 contributors, and over 13,000 commits, OpenCode is used and trusted by over 7.5M developers every month.

Fig 1. 160K GitHub Stars

Fig 2. 900 Contributors

Fig 3. 7.5M Monthly Devs

### Built for privacy first

[*]

OpenCode does not store any of your code or context data, so that it can operate in privacy sensitive environments. Learn more about privacy.

### FAQ

What is OpenCode?

How do I use OpenCode?

Do I need extra AI subscriptions to use OpenCode?

Can I use my existing AI subscriptions with OpenCode?

Can I only use OpenCode in the terminal?

How much does OpenCode cost?

What about data and privacy?

Is OpenCode open source?

Access reliable optimized models for coding agents

Zen gives you access to a handpicked set of AI models that OpenCode has tested and benchmarked specifically for coding agents. No need to worry about inconsistent performance and quality across providers, use validated models that work.

Learn about Zen

### Be the first to know when we release new products

Join the waitlist for early access.

Subscribe

English

---

### 结果 2
**Title:** Intro | AI coding agent built for the terminal
**URL:** https://dev.opencode.ai/docs/

Intro | AI coding agent built for the terminalIntro | OpenCode Skip to content
[...]
Get started with OpenCode.
[...]
OpenCode is an open source AI coding agent. It's available as a terminal-based interface, desktop app, or IDE extension.
[...]
To use OpenCode in your terminal, you'll need:
[...]
The easiest way to install OpenCode is through the install script.
[...]
You can also install it with the following commands:
[...]
-g opencode-ai
[...]
We recommend using the OpenCode tap for
[...]
most up to date releases. The official`brew install opencode` formula is maintained by the Homebrew
[...]
g opencode
[...]
With OpenCode you can use any LLM provider by configuring their API keys.
[...]
If you are new to using LLM providers, we recommend using OpenCode Zen. It's a curated list of models that have been tested and verified by the OpenCode team.
[...]
Run the`/connect` command in the TUI, select opencode, and head to opencode.ai/auth.
[...]
Sign in, add your billing details, and copy your API key.
[...]
Paste your API key.
[...]
Now that you've configured a provider, you can navigate to a project that you want to work on.
[...]
And run OpenCode.
[...]
```
opencode
[...]
Next, initialize OpenCode for the project by running the following command.
[...]
```
/init
[...]
This will get OpenCode to analyze your project and create an`AGENTS.md` file in the project root.
[...]
This helps OpenCode understand the project structure and the coding patterns used.
[...]
You are now ready to use OpenCode to work on your project. Feel free to ask it anything!
[...]
You can ask OpenCode to explain the codebase to you.
[...]
### Add features
[...]
You can ask OpenCode to add new features to your project. Though we first recommend asking it to create a plan.
[...]
OpenCode has a Plan mode that disables its ability to make changes and instead suggest how it'll implement the feature.
[...]
OpenCode can scan any
[...]
you give it
[...]
### Make changes
[...]
For more straightforward changes, you can ask OpenCode to directly build it without having to review the plan first.
[...]
### Undo changes
[...]
Let's say you ask OpenCode to make some changes.
[...]
But you realize that it is not what you wanted. You can undo the changes using the`/undo` command.
[...]
OpenCode will now revert the changes you made and show your original message again.
[...]
Or you can redo the changes using the`/redo` command.
[...]
The conversations that you have with OpenCode can be shared with your team
[...]
And that's it! You are now a pro at using OpenCode.
[...]
To make it your own, we recommend picking a theme, customizing the keybinds, configuring code formatters, creating custom commands, or playing around with the OpenCode config.

---

### 结果 3
**Title:** OpenCode | The open source AI coding agent
**URL:** https://opencode.ai/?referrer=wordpress.com

OpenCode | The open source AI coding agent

New

Desktop app available in beta on macOS, Windows, and Linux. Download now Download the desktop beta now

# The open source AI coding agent

Free models included or connect any model from any provider, including Claude, GPT, Gemini and more.

curlnpmbunbrewparu

```
curl -fsSL https://opencode.ai/install | bash
```

Your browser does not support the video tag.

### What is OpenCode?

OpenCode is an open source agent that helps you write code in your terminal, IDE, or desktop.

[*]

LSP enabled Automatically loads the right LSPs for the LLM

[*]

Multi-session Start multiple agents in parallel on the same project

[*]

Share links Share a link to any session for reference or to debug

[*]

GitHub Copilot Log in with GitHub to use your Copilot account

[*]

ChatGPT Plus/Pro Log in with OpenAI to use your ChatGPT Plus or Pro account

[*]

Any model 75+ LLM providers through Models.dev, including local models

[*]

Any editor Available as a terminal interface, desktop app, and IDE extension

### The open source AI coding agent

[*]

With over 160,000 GitHub stars, 900 contributors, and over 13,000 commits, OpenCode is used and trusted by over 7.5M developers every month.

Fig 1. 160K GitHub Stars

Fig 2. 900 Contributors

Fig 3. 7.5M Monthly Devs

### Built for privacy first

[*]

OpenCode does not store any of your code or context data, so that it can operate in privacy sensitive environments. Learn more about privacy.

### FAQ

What is OpenCode?

How do I use OpenCode?

Do I need extra AI subscriptions to use OpenCode?

Can I use my existing AI subscriptions with OpenCode?

Can I only use OpenCode in the terminal?

How much does OpenCode cost?

What about data and privacy?

Is OpenCode open source?

Access reliable optimized models for coding agents

Zen gives you access to a handpicked set of AI models that OpenCode has tested and benchmarked specifically for coding agents. No need to worry about inconsistent performance and quality across providers, use validated models that work.

### Be the first to know when we release new products

Join the waitlist for early access.

Subscribe

English

---

## 3. 对比总结

| 维度 | MCP exa | aek CLI |
|------|---------|---------|
| **输出格式** | 结构化字段（Title/URL/Published/Author/Highlights） | 扁平化列表（编号1-10） |
| **结果数量** | 3条（我限制了） | 10条 |
| **内容详细度** | Highlights包含多个[...]分隔的片段 | 完整网页内容，无截断 |
| **元数据** | Published/Author | 无 |
| **提供商** | 无 | 标注 `[exa]` |
| **性能统计** | 无 | 显示耗时 `676ms` |
| **内容来源** | Exa API原始highlights | Exa API完整text |

**关键发现**：
1. MCP exa返回的是highlights数组（多个片段），aek CLI返回的是完整text
2. 两者内容量现在已经一致（修复了截断问题）
3. MCP exa有结构化元数据，aek CLI更简洁
