# 本项目必须遵守的规则

## 不准在packages各个包的文件夹中写README

## CWD的skills文件夹有具体的使用方法说明，务必查看

## 禁止将txt、json、jsonc、md等模板文件中的内容硬编码到各个编程语言文件中

## 部署方式：本地编译（严禁走npm云端发布）

**核心原则：只要源码在这里，就用本地编译，不走 npm publish。**

### 编译部署流程
- **统一入口**：`scripts/build_deploy.py`
- **启动脚本**：`scripts/start.py`
- **Go 包**：`go build` 编译本机 + 对端平台二进制
- **JS 包**：直接复制文件到 `node_modules/@cheezmil/<pkg>`，不走 `npm install -g`

### 脚本放置规范
- 所有脚本统一放 `scripts/` 目录
- Windows 部署脚本放 `scripts/for-wsl/` 子目录
- 命名规范：`start_<功能>.py`

### npm 包处理
- **禁止**在开发脚本中执行 `npm publish`
- **禁止**引用云端 npm 包，只用本地源码
- WSL↔Windows 双端同步通过 staging 目录实现

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

### npm install -g 在 Windows 上的问题
- `npm install -g` 在 Windows 上会创建 **Junction 符号链接**
- Junction 符号链接会导致模块解析失败
- **正确做法**：直接复制文件到 `node_modules/@cheezmil/<pkg>`

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

修改 `packages/aek-skill-manager/aek-system-skill/<skill-name>/SKILL.md` 后，**禁止手动 cp 到任何工具目录**，必须走正确流程：

```
1. 改 repo 里的源文件
2. cqg acp 提交推送
3. aek sm sync
```

`aek sm sync` 会：
- transfer-sync 先对齐 WSL ↔ Windows 中心仓库
- ensureSystemSkills 从源复制系统 skill 到中心仓库
- 分发到所有工具的 skills 目录
