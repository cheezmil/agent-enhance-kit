# 脚本定位与命令

规范路径：`comet/reference/scripts.md`

本文件是 Comet 脚本定位和 state/guard/handoff/archive 命令面的单一事实来源。每会话加载一次，然后复用缓存的环境变量。

## 引导（每会话运行一次）

Comet 脚本随 skill 包分发在 `comet/scripts/` 下。**不硬编码路径** — 定位一次，缓存到环境变量。子 Skill 可以直接引用本节，只有需要完全自包含执行时才内联此块；修改时以本文件为单一事实源：

```bash
COMET_ENV="${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/comet/scripts/comet-env.mjs' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.mjs not found. Ensure the comet skill is installed." >&2
  return 1
fi
COMET_SCRIPTS_DIR="$(node "$COMET_ENV")"
COMET_STATE="$COMET_SCRIPTS_DIR/comet-state.mjs"
COMET_GUARD="$COMET_SCRIPTS_DIR/comet-guard.mjs"
COMET_HANDOFF="$COMET_SCRIPTS_DIR/comet-handoff.mjs"
COMET_ARCHIVE="$COMET_SCRIPTS_DIR/comet-archive.mjs"
COMET_INTENT="$COMET_SCRIPTS_DIR/comet-intent.mjs"

# 脚本定位失败时停止流程
if [ -z "$COMET_SCRIPTS_DIR" ]; then
  echo "ERROR: Comet scripts not found. Ensure the comet skill is installed." >&2
  return 1
fi
```

加载 comet 后，agent 应执行以上变量赋值一次，后续全程复用 `$COMET_GUARD`、`$COMET_STATE`、`$COMET_HANDOFF`、`$COMET_ARCHIVE`、`$COMET_INTENT`。

## 自动状态更新

guard 支持 `--apply` 参数，验证通过后自动更新 `.comet.yaml` 状态字段：

```bash
node "$COMET_GUARD" <change-name> <phase> --apply
```

`--apply` 内部委托给 `comet-state transition`。需要直接表达状态事件时使用：

```bash
node "$COMET_STATE" transition <change-name> open-complete
node "$COMET_STATE" transition <change-name> design-complete
node "$COMET_STATE" transition <change-name> build-complete
node "$COMET_STATE" transition <change-name> verify-pass
node "$COMET_STATE" transition <change-name> verify-fail
```

归档完成由 `node "$COMET_ARCHIVE" <change-name>` 负责；OpenSpec 会把 change 移到带日期前缀的归档目录，不要手动 transition 一个 `<archive-name>`。

## 解析下一步

阶段守卫推进 phase 后，用 `next` 子命令解析是否自动调用下一个 skill：

```bash
node "$COMET_STATE" next <change-name>
```

输出 `NEXT: auto|manual|done` + `SKILL: <skill-name>`（`done` 时省略）+ `HINT`（仅 `manual` 时）。`auto_transition: false` 时输出 `manual`，只暂停下一 skill 调用，不影响已发生的 phase 推进。

## 归档脚本

一键完成归档全部步骤：

```bash
node "$COMET_ARCHIVE" <change-name>
```
