---
name: aek-deployment
description: Deploy the AEK monorepo locally and cross-compile to Windows from WSL.
category: software-development
tags: [aek, deployment, go-build, wsl, windows]
---

# AEK Monorepo Deployment

Deploy `agent-enhance-kit` on Linux (WSL) and Windows simultaneously.

## When to Use

- User asks to install/deploy AEK
- After pulling the repo or switching branches and needing a working install
- After a rebuild is needed (e.g. after code changes)

## Prerequisites

```bash
go version          # Go 1.24+ required
node --version      # Node >= 18
pnpm --version
```

## Step 1 — Install Dependencies

```bash
pnpm install --ignore-scripts
```

`--ignore-scripts` suppresses unsupported-platform warnings from optionalDependencies on non-target architectures.

## Step 2 — Build All Platform Binaries

```bash
pnpm run build      # runs go build for each Go package
```

Verify all three succeed:
```bash
pnpm run build      # aek-websearch, aek-mcp, aek-task-manager, aek-browser all Done
```

If one hangs (e.g. `aek-mcp`), run separately with `--short <pkg>` and a longer timeout:
```bash
python3 scripts/for-maintainers/build-platform-bins.py --short aek-mcp
```

If the command times out, run with `background=true` and `notify_on_complete=true`.

## Step 3 — Verify Build Passes

```bash
pnpm run build      # runs go build for each Go package
pnpm run test       # runs node --test + go test
```

Both must exit 0 before proceeding.

### Known Issues

- **`pnpm install` blocks on `approve-builds` interactive prompt**: If esbuild build scripts are ignored, run `pnpm install --ignore-scripts` first, then `pnpm approve-builds` interactively. Or set `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`.
- **`pnpm run test --filter=` passes `--filter` to Go**: pnpm's `--filter` flag is passed through to all scripts including Go. Use `pnpm --filter=@cheezmil/aek-websearch test` instead of `pnpm run test --filter=...`.

## Step 4 — Global Install on Linux (USE npm, NOT pnpm)

**Critical:** `pnpm add -g` fails with *\"global bin directory not in PATH\"*. Use `npm install -g` instead:

```bash
npm install -g \
  file:packages/aek-common \
  file:packages/aek-websearch \
  file:packages/aek-task-manager \
  file:packages/aek-mcp \
  file:packages/aek-skill-manager \
  file:packages/aek-prompt-manager \
  file:packages/aek
```

This installs to `/home/<user>/.local/share/fnm/.../lib/node_modules/@cheezmil/`.

## Step 5 — Verify Linux Install

```bash
aek version         # shows \"0.0.0-dev\" (expected for local install)
aek ws doctor       # tests websearch provider health
aek sm --help       # tests skill-manager
aek pm --help       # tests prompt-manager
which aek
which aek-websearch
which aek-skill-manager
which aek-prompt-manager
which aek-tm
```

`0.0.0-dev` is normal for local installs. Published npm packages would show e.g. `0.1.4`.

## Step 6 — Deploy Windows Binaries from WSL

```bash
python3 packages/aek-websearch/scripts/for-wsl/start_deploy_aek-websearch-to-windows.py
```

**重要：** 此脚本从 `packages/aek-websearch/platforms/win32-x64/aek.exe` 读取已编译好的二进制，不自建。若找不到该文件，需先运行 `pnpm run build`。

此脚本：
1. 读取 `platforms/win32-x64/aek.exe`（由 `pnpm run build` 产出）
2. 复制到 `%USERPROFILE%\.aek\bin\win\`（含 `aek.exe` 和 `aek-websearch.exe`）
3. 确保 `%USERPROFILE%\.aek\bin\win` 在 PATH 中
4. 验证安装

For `aek-task-manager` and `aek-mcp`, deploy manually via a pwsh script:
```python
# Write a deploy-win-pkgs.py that copies each .exe to %USERPROFILE%\.aek\bin\win\
# See references/win-deploy-from-wsl.md for details
```

Verify Windows install:
```bash
/mnt/c/Users/<user>/.aek/bin/win/aek.exe version
/mnt/c/Users/<user>/.aek/bin/win/aek-mcp.exe --help
```

## Step 7 — Sync System Skills

```bash
aek sm init     # initializes center repo (~/.aek/skill-manager/skills/)
aek sm sync     # syncs 6 system skills to all tools
```

## Step 8 — Patch System Prompts

```bash
aek pm init     # initializes ~/.aek/prompt-manager/
aek pm patch all  # injects prompt into all 17 tools
```

**Design rule for prompt templates:** `cross_platform_shared.md` should ONLY contain lightweight reminders that tell the agent to look up the corresponding skill. Do NOT put detailed commands, flags, or API usage in the prompt — that is the skill's job. Example correct content:

```markdown
## AEK 系统工具使用规则
- AEK 提供若干系统工具：web search、MCP 代理、task manager、skill manager、prompt manager
- 使用各工具前，先查阅对应的系统 skill（`aek-websearch`、`aek-mcp`、`aek-task-manager` 等），以获取正确用法
- 写代码时不清楚就上网搜，不要瞎编
```

## Step 9 — Final Verification

```bash
aek pm status       # all 17 tools should show \"patched\"
aek sm sync         # all tools should show 6 system skills
```

## Pitfalls

1. **Never use `npm publish` on packages with `workspace:*` dependencies.** Only `pnpm publish` converts them. See AGENTS.md for full publishing rules.
2. **Never use `pnpm add -g`.** Use `npm install -g` — pnpm global bin dir is not in PATH by default and fails silently.
3. **`aek version` shows `0.0.0-dev`.** Normal for local install. Don't treat as a bug.
4. **Go binary subcommands vary.** Some subcommands like `--help` may not be wired. Test via JS wrapper `aek --help`.
5. **WSL→Windows deployment requires pwsh.exe with `-NoProfile` omitted.** The user's rule is \"禁止带上-NoProfile参数\". The deploy script handles this correctly.
6. **Create missing skills dirs** before syncing: some tools (e.g. cline at `~/.cline/skills/`) may lack a skills directory. `aek sm sync` will fail silently if the dir doesn't exist.
7. **Prompt templates must stay minimal.** Detailed commands belong in skills, not prompts. See [references/prompt-design-principles.md](references/prompt-design-principles.md).
8. **Windows npm prefix can point to a transient `fnm_multishells` directory.** When `npm config get prefix` returns a path under `fnm_multishells/*`, the `aek.ps1` shim is stale and points to a different temp directory each new window. Fix: `npm config set prefix \"C:\\Users\\<user>\\AppData\\Roaming\\npm\"` then `npm install -g @cheezmil/aek@...` to reinstall the shims at the correct persistent location.
9. **`pnpm install` may block on `approve-builds` interactive prompt.** If esbuild build scripts are ignored, run `pnpm install --ignore-scripts` first, then `pnpm approve-builds` interactively (or set `allowBuilds.esbuild: true` in `pnpm-workspace.yaml`).
10. **Deploy script does NOT cross-compile.** It reads from `platforms/win32-x64/aek.exe` produced by `pnpm run build`. Always run `pnpm run build` first when rebuilding Windows binaries.
11. **Windows binary deploy target is `~\.aek\bin\win\`**, not `~\bin\`. See [references/win-deploy-from-wsl.md](references/win-deploy-from-wsl.md).

## See Also

- `packages/aek-websearch/scripts/for-wsl/start_deploy_aek-websearch-to-windows.py` — WSL→Windows deploy script（读 platforms/win32-x64，不自建）
- `scripts/for-maintainers/build-platform-bins.py` — binary build orchestrator
- `AGENTS.md` — publishing rules (pnpm publish only, tag discipline)
- [references/win-deploy-from-wsl.md](references/win-deploy-from-wsl.md) — WSL→Windows 部署详解