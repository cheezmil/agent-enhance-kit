#!/usr/bin/env node
// aek shim — forward to @cheezmil/aek-common top-level CLI.
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
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