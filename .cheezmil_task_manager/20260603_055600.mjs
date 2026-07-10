import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

const targets = [
  '/home/xdx/CodeRelated/agent-enhance-kit/argus',
  '/home/xdx/CodeRelated/agent-enhance-kit/tests',
  '/home/xdx/CodeRelated/agent-enhance-kit/.venv',
  '/home/xdx/CodeRelated/agent-enhance-kit/pyproject.toml',
  '/home/xdx/CodeRelated/agent-enhance-kit/.python-version',
  '/home/xdx/CodeRelated/agent-enhance-kit/uv.lock',
];

const cliEntry = process.platform === 'win32'
  ? 'D:/CodeRelated/cheezmil-task-manager/ctm-cli/src/index.js'
  : join(homedir(), 'CodeRelated', 'cheezmil-task-manager', 'ctm-cli', 'src', 'index.js');

spawnSync(
  process.execPath,
  [cliEntry, 'recycle-to-trash-confirm', '--self-delete', fileURLToPath(import.meta.url), ...targets],
  { stdio: 'inherit' }
);
