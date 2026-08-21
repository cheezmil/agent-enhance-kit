#!/usr/bin/env node
// aek — 总入口 CLI
// 根据子命令 dispatch 到各子包

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/aek-common/bin/ → 根目录
const root = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);

function execTool(command, cmdArgs) {
  const result = spawnSync(command, cmdArgs, { stdio: 'inherit' });
  if (result.status !== null && result.status !== 0) {
    process.exitCode = result.status;
  }
}

function runSkillManager(rest) {
  const bin = path.join(root, 'packages', 'aek-skill-manager', 'bin', 'aek-skill-manager.js');
  execTool('node', [bin, ...rest]);
}

function runAekWebsearch(rest) {
  const bin = path.join(root, 'packages', 'aek-websearch', 'bin', 'aek');
  execTool(bin, rest);
}

function runAekMcp(rest) {
  const bin = path.join(root, 'packages', 'aek-mcp', 'bin', 'aek-mcp');
  execTool(bin, rest);
}

function runAekTaskManager(rest) {
  const bin = path.join(root, 'packages', 'aek-task-manager', 'bin', 'aek-task-manager');
  execTool(bin, rest);
}

function main() {
  if (args.length === 0) {
    runAekWebsearch(args);
    return;
  }

  const cmd = args[0];
  const rest = args.slice(1);

  switch (cmd) {
    case 'sm':
    case 'skill-manager':
      runSkillManager(rest);
      break;
    case 'ws':
    case 'websearch':
    case 'web':
      // 二进制以 `websearch` 作为子命令，需保留前缀（ws/web 别名转成 websearch）
      runAekWebsearch(['websearch', ...rest]);
      break;
    case 'mcp':
      runAekMcp(rest);
      break;
    case 'task':
    case 'tm':
    case 'task-manager':
      runAekTaskManager(rest);
      break;
    default:
      runAekWebsearch(args);
      break;
  }
}

main();