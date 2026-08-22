---
name: aek-install-and-init
description: AEK 安装和初始化，其他包用法不在此赘述，请查看对应包名的 skill。
---

## 安装

```bash
npm install -g @cheezmil/aek
```

单模块安装：

```bash
npm install -g @cheezmil/aek-websearch
```

## 升级

```bash
npm update -g @cheezmil/aek
```

## 平台支持

linux x64/arm64, macOS x64/arm64, Windows x64。

## 验证

```bash
aek version
```

## 各包初始化

各包有各自的 init 子命令，具体用法参见对应包名的 skill：

`aek-websearch` · `aek-mcp` · `aek-prompt-manager` · `aek-skill-manager` · `aek-task-manager`

## 发布流程

详见 `aek-release-workflow` skill。