#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const targets = [
  '/home/xdx/.config/opencode/commands/squad.md',
  '/home/xdx/.claude/commands/squad.md',
  '/home/xdx/.codex/skills/squad',
  '/home/xdx/.local/bin/squad',
  '/home/xdx/CodeRelated/test-squad',
  '/home/xdx/CodeRelated/squad',
];

const candidates = [
  join(homedir(), 'CodeRelated', 'cheezmil-task-manager', 'ctm-cli', 'src', 'index.js'),
  '/mnt/d/CodeRelated/cheezmil-task-manager/ctm-cli/src/index.js',
];
const cliEntry = candidates.find(existsSync) ?? candidates[0];

spawnSync(
  process.execPath,
  [cliEntry, 'recycle-to-trash-confirm', '--self-delete', fileURLToPath(import.meta.url), ...targets],
  { stdio: 'inherit' }
);
