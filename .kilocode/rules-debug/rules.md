

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
