# Changesets + npm 发布 Go 二进制方案

## 核心问题

Go 项目如何发布到 npm？用户如何通过 npm 安装更新？

## 解决方案

### 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **gowheels** | 自动打包各平台二进制 | 需要维护额外工具 |
| **postinstall 下载** | 简单可控 | 需要 GitHub Release |
| **go-npm** | 专用工具 | 已停止维护 |

### 最终选择：postinstall 下载

**工作流程：**
1. CI 编译各平台二进制，上传 GitHub Release
2. npm 包包含 postinstall.mjs 脚本
3. 用户 `npm install -g` 时下载对应平台二进制

**目录结构：**
```
packages/aek-websearch/
├── package.json          # name: aek-websearch
├── scripts/
│   └── postinstall.mjs   # 下载二进制
├── bin/                  # 运行时创建，包含 aek
└── platforms/            # 本地开发用，CI 不用
```

## 实现细节

### package.json

```json
{
  "name": "aek-websearch",
  "version": "1.6.0",
  "bin": {
    "aek": "bin/aek"
  },
  "scripts": {
    "postinstall": "node scripts/postinstall.mjs"
  }
}
```

### postinstall.mjs 核心逻辑

```javascript
const VERSION = require('../package.json').version;
const PLATFORM = process.platform;
const ARCH = process.arch;
const BIN_NAME = `aek-${PLATFORM}-${ARCH}.tar.gz`;
const URL = `https://github.com/cheezmil/agent-enhance-kit/releases/download/aek-websearch@v${VERSION}/${BIN_NAME}`;

// 下载并解压到 bin/aek
```

## 注意事项

1. **Go 版本变量**：aek-websearch 的 `root.go` 有 `version = "0.0.0-dev"`，通过 ldflags 注入或 sync-versions.py 同步
2. **aek-task-manager**：没有 version 变量，不需要同步
3. **aek-mcp**：private: true，不发布，用固定 tag 或手动管理

## 测试命令

```bash
# 验证 changeset 流程
pnpm changeset
pnpm changeset version
python3 scripts/sync-versions.py
pnpm run build

# 验证 npm 发布
cd packages/aek-websearch && npm publish --dry-run
```
