# 你每次务必遵守的规则

## 本地工作目录搜索规则
- 禁止用老土grep，只能用rg。

## 非常非常重要
### 禁止执行这些git命令
git restore --source=HEAD --staged --worktree .
git checkout HEAD -- .
git checkout -- 文件名
git reset --hard HEAD
git reset --hard 任意commit哈希
git clean -f
git clean -fd
git push -f / git push --force
git merge --abort 乱终止合并
git stash pop

### 禁止执行这些
taskkill /F /IM node.exe （未经用户允许禁止这么写）
robocopy

### 禁止执行这些获取文件内容命令
cat C:\Users\xdx\AppData\Local\fnm_multishe啥啥没有任何意义这是链接路径




## 你要恢复某个文件到最新的commit，只能用git stash push 文件夹路径或文件路径 -m "干嘛了"
若要恢复stash的东西，只能用git stash apply，禁止用git stash pop

## 必须用简体中文回复我！必须用简体中文思考！

### 若用户当前表明或工作目录中AGENTS.md表明有其他的删除逻辑或方法，则请忽略上面的删除逻辑。


## 如果代码文件是英文注释则修改或新增的文件都写英文注释，同理中文也是，除非用户有在本规则中其他地方有特殊说明。不能带上多余的废话，比如“中文：”，“English：”。

## 上网搜索优先用exa这个搜索工具！这个工具有时候会报错，没关系，必须再次尝试直到8次过后还是报错就放弃，若此时非常依赖搜索的内容才能进行写代码则必须停下来告诉用户这个工具失效了，若不依赖搜索的内容也能准确的修正代码则可以继续。其次才用系统自带的工具函数。禁止用chrome-mcp-tool搜索但可用它打开具体的调试网页。
今年是2026年，优先上网搜索最新的参考资料


## 未经允许禁止写任何其他的md文档。

## 若项目所用编程语言支持跨平台，则你写的所有代码必须跨平台都能用。

## 有时候你会看到一些存储token或key的文件，禁止直接阅读这些文件，不准打印出来到控制台，不能直接把密钥内容硬编码到代码中，而是遵守用户的指示，一般是让程序自己直接从密钥的绝对路径读取。

## 在写一些可以跨平台的脚本时，比如mjs，js，py，等等，这些后缀的脚本时
- 务必适配跨平台windows、linux、macos
- 务必在你执行命令后查明情况，才写出最正确的脚本，不要直接先写出脚本。
- mjs脚本务必加上#!/usr/bin/env node，否则无法使用。
- 若合适的话，应该尽量写py脚本优先

## 用户要求你写脚本后，你必须自己执行，看看有没有错误，有错误就修正，直到脚本执行达到需求。

## 若某些命令很难很多写成一行执行，或没法在一条命令中完成某些操作比如图片视频转换压缩，则必须在当前pwd的scripts文件夹或项目规则指定的路径或用户指定的路径生成脚本。
若使用到了python则务必使用环境变量的base环境，禁止创建新的虚拟环境。

## 单次curl命令禁止执行超过5秒。

## 禁止随意帮用户cqg acp，只有用户说了才帮，用户不说就不帮



## 修改skill的方法
在“D:\CodeRelated\cheezmil-task-manager\agent_shared_global\agent_shared_global_skills\skills”
这个文件夹中创建文件夹，若处于wsl中注意用mnt路径，在该文件夹中放置一个SKILL.md，按照plaintext包裹住的内容例子写入SKILL.md，其中（（））包裹的是我给你的提示不要原封不动放到md中。

```plaintext
---
name: <和文件夹同名>
description: 简单写这个skill能干嘛
---

（（下面以markdown格式以最少token地写法完整地表达出这个skill的功能））

```

最后，执行“D:\CodeRelated\cheezmil-task-manager\agent_shared_global\agent_shared_global_skills\generate_all_global_skills.py”，让写的skill生效。

### 注意事项
#### skill\scripts中尽可能写py脚本，有时候单纯前两者不够用，若需要对应平台的ps1和sh那就写上。
#### 一个skill的文件夹结构例如
skill文件夹/
├── SKILL.md               # 必须
├── scripts/               # 可选
├── references/            # 可选
└── assets/                # 可选


## 操控浏览器只能用browser-harness这个skill，禁止用其他方式，CDP端口已经内置于skill包env中。

## 用户让你写脚本，你应该先观察项目结构有啥语言的现成脚本，若用户没指定的话一般就是写py脚本。

## 若你上网搜索了各种开源项目、软件、工具等等，若你觉得需要clone到本地来查看的时候，务必clone到“~/CodeRelated/<当前的CWD文件夹名-dev-reference>/”。

## C++，安卓开发，RN，Flutter项目编译需要的依赖我都放到了“~/CodeRelated/public”，有细分的文件夹，你自己查看，别乱重新反复下载，当然你要开发别的语言的项目，依赖也是放在这个路径并设置好环境变量，不要放在默认的位置。

## 若你的环境是WSL2 linux，有些时候需要执行windows命令。需要& "/mnt/c/Program Files/PowerShell/7/pwsh.exe" -c "win命令"这样就能执行，禁止带上-NoProfile参数。

## 用户经常会丢给你Windows路径，比如“D:\CodeRelated”，若你发现你自己处于wsl，那必须用“/mnt/d/CodeRelated”路径，除非特殊情况否则不要用windows路径，因为各种程序在linux都用不了反斜杠。



## 若用户具体表明在哪里放置文件夹或文件，都默认在当前所处工作目录放置。

<!-- head-aek-pm-patch -->
<!-- head-aek-system-built-in-prompt -->
## AEK 系统工具使用规则

- AEK 提供若干系统工具：web search、MCP 代理、task manager、skill manager、prompt manager
- 使用各工具前，先查阅对应的系统 skill（`aek-websearch`、`aek-mcp`、`aek-task-manager` 等），以获取正确用法
- 写代码时不清楚就上网搜，不要瞎编
<!-- end-aek-system-built-in-prompt -->
<!-- end-aek-pm-patch -->