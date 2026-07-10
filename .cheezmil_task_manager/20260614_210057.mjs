#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 要删除的.mjs文件绝对路径
const targets = [
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/build-all.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/test-all.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-websearch/build-linux-x64.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-websearch/test.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-websearch/build-all-platforms.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-websearch/postinstall.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-websearch/start.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-mcp/build-linux-x64.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-mcp/test.mjs',
  '/home/xdx/CodeRelated/agent-enhance-kit/scripts/aek-mcp/start.mjs',
];

const cliEntry = process.platform === 'win32'
  ? 'D:/CodeRelated/cheezmil-task-manager/ctm-cli/src/index.js'
  : '/home/xdx/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/ctm-cli/dist/index.js';

spawnSync(
  process.execPath,
  [cliEntry, 'recycle-to-trash-confirm', '--self-delete', fileURLToPath(import.meta.url), ...targets],
  { stdio: 'inherit' }
);
