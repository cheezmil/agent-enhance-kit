#!/usr/bin/env node
// aekpm — aek-prompt-manager 的短别名。
// 直接复用同一个启动器模块，不重复解析路径、不二次 spawn。
import { setWindowsNodePath } from './_win-bootstrap.mjs';
setWindowsNodePath();
import('../src/cli.js');
