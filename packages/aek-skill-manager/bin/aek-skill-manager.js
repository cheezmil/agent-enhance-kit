#!/usr/bin/env node
// aek-skill-manager — Windows 上需要从全局 node_modules 解析 @cheezmil/aek-common
// 当进程从 WSL UNC 路径启动时，Node.js 模块解析会失败，需要设置 NODE_PATH
import { setWindowsNodePath } from './_win-bootstrap.mjs';
setWindowsNodePath();
import('../src/cli.js');
