#!/usr/bin/env node
// aek — 总入口 CLI
// 根据子命令 dispatch 到各子包
// 兄弟探测：monorepo 开发（packages/）与 npm 全局安装（node_modules/@cheezmil/）
// 两种形态下 __dirname 的 ../../ 都恰好是「兄弟包所在目录」：
//   monorepo: packages/aek-common/bin/../../aek-websearch/bin/aek
//   global:   node_modules/@cheezmil/aek-common/bin/../../aek-websearch/bin/aek

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function findSubBin(subDir, binRel) {
  const bin = path.resolve(__dirname, '..', '..', subDir, binRel);
  return existsSync(bin) ? bin : null;
}

function missingTip(subPkg, hintCmd) {
  console.error(
    `[aek] 未安装 ${subPkg}，请执行：npm install -g ${hintCmd}`
  );
  process.exitCode = 1;
}

function execTool(command, cmdArgs) {
  const result = spawnSync(command, cmdArgs, { stdio: 'inherit' });
  if (result.status !== null && result.status !== 0) {
    process.exitCode = result.status;
  }
}

function runSkillManager(rest) {
  const bin = findSubBin('aek-skill-manager', 'bin/aek-skill-manager.js');
  if (!bin) return missingTip('@cheezmil/aek-skill-manager', '@cheezmil/aek-skill-manager');
  execTool('node', [bin, ...rest]);
}

function runAekWebsearch(rest) {
  const bin = findSubBin('aek-websearch', 'bin/aek-websearch.js');
  if (!bin) return missingTip('@cheezmil/aek-websearch', '@cheezmil/aek-websearch');
  execTool('node', [bin, ...rest]);
}

function runAekMcp(rest) {
  const bin = findSubBin('aek-mcp', 'bin/aek-mcp.js');
  if (!bin) return missingTip('@cheezmil/aek-mcp', '@cheezmil/aek-mcp');
  execTool('node', [bin, ...rest]);
}

function runAekTaskManager(rest) {
  const bin = findSubBin('aek-task-manager', 'bin/aek-tm.js');
  if (!bin) return missingTip('@cheezmil/aek-task-manager', '@cheezmil/aek-task-manager');
  execTool('node', [bin, ...rest]);
}

function main() {
  if (args.length === 0) {
    console.log(`Usage: aek <command> [options]

Available commands:
  sm, skill-manager  Sync Agent Skills from central repo to agent tools
  ws, websearch, web Web search and content tools (multi-provider)
  mcp                MCP proxy gateway
  task, tm           Task management (experimental)
`);
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