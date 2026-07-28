#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoDir = path.resolve(__dirname, '..');
process.chdir(repoDir);

const result = spawnSync('cqg', ['sync-git-config', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  cwd: repoDir,
});
process.exit(result.status ?? 1);
