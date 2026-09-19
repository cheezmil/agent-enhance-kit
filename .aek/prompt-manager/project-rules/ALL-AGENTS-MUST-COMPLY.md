# 本项目必须遵守的规则

## （AI经常不遵守这些规则，用户可手动复制重新发给AI）
- 必须cd到'~/.aek/test'测试。windows在"$env:USERPROFILE\.aek\test测试
- 除了可直接调用windows里面的pwsh，其他任何情况禁止使用/mnt挂载路径，脚本中禁止访问/mnt/c/Users/<用户名>/.aek/src/，其没有任何必要在wsl中访问，因为windows环境可间接用UNC路径得到WSL里面的文件夹或文件。不准直接用UNC路径，应该从UNC复制文件夹到用户所说的合适位置，这是一切的前提，然后再windows调用这个合适位置，之后就禁止再用UNC路径。注意用UNC路径的脚本执行者只能是windows环境这边的终端，WSL是用不了UNC路径的。UNC路径禁止硬编码wsl.localhost\\<wsl发行版型号>\\
- 不准永久修改 PATH；可手动添加一次性的PATH，
- 不准硬编码用户名，注意用~/或$env:USERPROFILE
- 除非特殊的，最好不要硬编码任何路径；例如硬编码D盘任何路径就是完全错误的
- 禁止复制任何node_moudules，只要复制那必然会出错
- 问题解决不了就上网搜索网友讨论和解决办法
- 本地搜索禁止用老土grep，务必用rg。
- 若当前用的框架不支持的别的系统就别强行支持，若支持跨平台则写的代码必须尽可能支持windows、linux、macos
- 禁止循环思考，禁止循环发送同样的消息给我，禁止循环做同样的事情
- 禁止用sed修改文件，必须用你agent自带的系统工具修改文件
- 禁止在win终端对着win路径使用linux命令和cmd命令，只能在win终端执行pwsh命令，禁止带-NoProfile参数！禁止带-NoProfile参数！禁止带-NoProfile参数！
- 执行危险的命令务必谨慎，确保100%安全
- 写代码时逻辑尽可能不要冗余，如果可以共用逻辑就拆分出来。
- 若环境是WSL，若要执行win命令。则例如"/mnt/c/Program Files/PowerShell/7/pwsh.exe" -c "win命令"这样就能执行命令。带上-NoProfile参数会出错。有pwsh7就禁止使用powershell5
- 不要在wsl编译windows的go，让windows自己编译
- 要结合源码修改，而不是硬是用编译部署脚本替换参数。。
- 注意细分build_deploy.py的参数，节约测试时间，有的包已经正常就没必要再编译
- 把路径计算处理问题全部放到start_scripts_shared_logic.py得到完全准确的路径再被build_deploy.py使用。禁止在build_deploy.py计算任何路径。注意方法解耦，不要重复写计算方法。。
- 改进对应包的源码后，必须去packages\aek-skill-manager\aek-system-skill改进对应包的skill文档，然后用aek-skill-manager将skill同步到所有agent工具。
- 除了npm install -g和uninstall -g，其他一律用pnpm

## 不准在packages各个包的文件夹中写README

## CWD的skills文件夹有具体的使用方法说明，务必查看

## 禁止将txt、json、jsonc、md等模板文件中的内容硬编码到各个编程语言文件中

## 部署方式：本地编译（严禁走npm云端发布）

**核心原则：只要源码在这里，就用本地编译，不走 npm publish。**

### 编译部署流程
- **统一入口**：`scripts/build_deploy.py`
- **启动脚本**：`scripts/start.py`

### 脚本放置规范
- 所有脚本统一放 `scripts/` 目录

## WSL↔Windows 跨平台部署铁律（违规会出事故，必须遵守）

### PowerShell 变量展开陷阱
- **单引号** `'...'` 和 **heredoc** `@'... '@` 都不展开变量
- PowerShell 脚本中若需展开变量，必须用双引号包裹
- **推荐方案**：在 Python 端构建完整内容，直接写入文件

### Python os.path 陷阱
- Python 的 `os.path` 用平台原生分隔符
- **禁止**用 `os.path.dirname()` 处理跨平台路径（返回空字符串）
- **正确做法**：通过动态命令获取路径

### Windows 路径在 WSL 中的读写
- WSL 可通过挂载点访问 Windows 文件系统
- **禁止**假设用户名，必须动态获取
- **禁止**硬编码系统路径，必须用动态查找

### ESM vs CJS 模块解析差异
- **ESM** (`import`) 不认 `NODE_PATH` 环境变量
- **CJS** (`require.resolve()`) 认 `NODE_PATH`
- **因此**：不能在 PowerShell 中设置 `NODE_PATH` 来解决 ESM 模块找不到问题

### dist/ 目录排除规则
- 对有 `build` 脚本的 JS 包，**必须保留 dist/ 目录**
- 只有纯源码包（无 build 脚本）才排除 dist/
- **检测方法**：读取 package.json 的 `scripts.build` 字段判断

### 临时脚本清理
- **禁止**将调试脚本留在仓库根目录或 scripts/ 目录
- 每个测试脚本完成后必须删除

## 本aek系统预制的skill必须用packages/aek-skill-manager使它们存在，预制的全局提示词patch必须用packages/aek-prompt-manager去patch

## aek-skill-manager 系统 skill 更新铁律

修改各个 `packages/aek-skill-manager/aek-system-skill/<skill-name>/` 后，**禁止手动 cp 到任何工具目录**，然后
`aek sm sync` 会：
- transfer-sync 先对齐 WSL ↔ Windows 中心仓库（macOS不生效）
- ensureSystemSkills 从源复制系统 skill 到中心仓库
- 分发到所有工具的 skills 目录
