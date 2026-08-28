

---

# 本项目必须遵守的规则

## 不准在packages各个包的文件夹中写README

## CWD的skills文件夹有具体的使用方法说明，务必查看

## 禁止将txt、json、jsonc、md等模板文件中的内容硬编码到各个编程语言文件中

## 部署方式：优先本地编译，其次 npm 云端包

本项目通过 npm 管理发布（如 @cheezmil/aek-websearch 及各平台二进制子包 -linux-x64/-win32-x64 等）。

选择规则（按优先级）：
1. 能打开本项目源码并与之对话的都是高级用户/开发者 → 优先走本地编译：go build 得到本地二进制，再 npm install 本地包（本地文件夹安装会自动连带打包编译好的二进制，launcher 会自动优先解析本地产物）。
2. 仅当用户电脑无法编译（缺 Go 工具链等）时，才 npm install 云端的预编译包。

部署脚本统一放 packages/<包>/scripts/ 下，复用 shared/start_scripts_shared_logic.py，禁止把模板/脚本内容硬编码进代码。

## 打 tag 与 npm 发布铁律（违规会出事故，必须遵守）

### npm 发布必须用 pnpm publish（最关键）
- 任何含 workspace:* 依赖的包 **绝不能用 npm publish**。npm publish 不会把 workspace:* 转成具体版本，会把 `workspace:*` 字面量直接打进发布的包里，导致安装时依赖解析失败（平台二进制拉不下来）。只有 pnpm publish 才会转换 workspace:*. 典型：主包 @cheezmil/aek-websearch 的 optionalDependencies 指向各平台子包；元包 @cheezmil/aek 的 dependencies 全是 workspace:*。
- 平台子包（无任何 workspace 依赖）才可用 npm publish。
- 发布顺序：先全部平台子包，再主包（主包 optionalDeps 引用平台子包的具体版本）。
- 发布前必须 npm view 确认每个 workspace 依赖已在 registry；发布后校验已发布包的 dependencies/optionalDependencies 是具体版本而非 workspace:*。
- registry 有传播延迟：刚发布立即 npm view 会 404，等约 10s 再验证，不要误判为没发布。
- 若误用 npm publish 发布了坏版本：npm 禁止覆盖同版本，且 bypass-2FA 的 granular token 无法 unpublish（403）→ 只能把主包+全部平台子包统一 bump 到新版本再用 pnpm publish 重发（fixed 组要求主包与平台子包版本永远一致），坏版本残留无法删除。

### 打 tag / GitHub Release 铁律
- 每次发布必须补齐 tag：aek-websearch@v0.x.y、aek@v0.x.y，tag 版本与实际发布版本一致，并 push 到 github 与 gitea 两个 remote。
- 禁止用 `git push --tags`（远端已有旧 tag 会整批 reject 且误报失败），应单独 push 本次新增 tag：`git push github <tag1> <tag2>`。
- 发布后创建 GitHub Release（复用 scripts/for-maintainers/release.py 的 create_github_release）。


## 本aek系统预制的skill必须用packages\aek-skill-manager使它们存在，预制的全局提示词patch必须用packages\aek-prompt-manager去patch，这两个不做，不算安装完成。