#!/usr/bin/env node
// aek — 子包垫片：转发到 @cheezmil/aek-common 总入口
// 用 require.resolve 定位 aek-common（兼容平铺/嵌套/symlink 布局）。

const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

// CJS 下 createRequire 以本文件为基准
const requireResolve = createRequire(__filename);

let entry;
try {
  entry = requireResolve.resolve('@cheezmil/aek-common/bin/aek.js');
} catch {
  console.error('[aek] 未找到 @cheezmil/aek-common，请安装：npm install -g @cheezmil/aek-common');
  process.exit(1);
}

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.status !== null) process.exitCode = result.status;