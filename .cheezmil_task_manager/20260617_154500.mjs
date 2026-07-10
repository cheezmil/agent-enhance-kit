#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const targets = [
  '/home/xdx/CodeRelated/agent-enhance-kit/packages/aek-websearch/bin/aek.js',
];

let cliEntry;
try {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  cliEntry = join(globalRoot, 'ctm-cli', 'dist', 'index.js');
} catch {
  cliEntry = process.platform === 'win32'
    ? 'D:/CodeRelated/cheezmil-task-manager/ctm-cli/src/index.js'
    : join(homedir(), 'CodeRelated', 'cheezmil-task-manager', 'ctm-cli', 'src', 'index.js');
}

spawnSync(
  process.execPath,
  [cliEntry, 'recycle-to-trash-confirm', '--self-delete', fileURLToPath(import.meta.url), ...targets],
  { stdio: 'inherit' }
);
