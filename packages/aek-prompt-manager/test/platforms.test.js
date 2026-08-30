import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PLATFORMS } from '../src/platforms.js';
import {
  MAPPING_SOURCE, sharedDir, toolDir, PLATFORM_FILE,
  patch, apply, unpatch, isWSL,
} from '../src/core.js';

function platform(id) {
  const found = PLATFORMS.find((p) => p.id === id);
  assert.ok(found, `platform ${id} should exist`);
  return found;
}

// 设置/清除 env 值。注意 process.env.X = undefined 会变成字符串 'undefined'，必须用 delete。
function setEnv(key, value) {
  process.env[key] = value;
}
function clearEnv(key) {
  delete process.env[key];
}

// Windows 原生布局的 globalPromptPath：当传入 {os:'win32'} 且 home 是 /mnt/... 时，
// 应保持正斜杠路径以便 WSL 内 node fs 直接写入。
test('globalPromptPath supports Windows-native layout via options (WSL /mnt style)', () => {
  const winRoot = '/mnt/c/Users/xdx';
  assert.equal(platform('claude-code').globalPromptPath('claude-code', { home: winRoot, os: 'win32' }), '/mnt/c/Users/xdx/.claude/CLAUDE.md');
  assert.equal(platform('codex').globalPromptPath('codex', { home: winRoot, os: 'win32' }), '/mnt/c/Users/xdx/.codex/AGENTS.md');
  // opencode 在 win 布局用 LOCALAPPDATA（WSL 风格下还原到 home 下 AppData\Local）
  setEnv('LOCALAPPDATA', '/mnt/c/Users/xdx/AppData/Local');
  try {
    assert.equal(platform('opencode').globalPromptPath('opencode', { home: winRoot, os: 'win32' }), '/mnt/c/Users/xdx/AppData/Local/opencode/AGENTS.md');
  } finally {
    clearEnv('LOCALAPPDATA');
  }
  // hermes 在 win 布局用 %USERPROFILE%\.hermes\（与 unix ~/.hermes 一致，不用 LOCALAPPDATA）
  assert.equal(platform('hermes').globalPromptPath('hermes', { home: winRoot, os: 'win32' }), '/mnt/c/Users/xdx/.hermes/SOUL.md');
});

// 原生 Windows home（C:\Users\...）仍应走 win32 分隔符。
test('globalPromptPath native Windows home keeps backslash separators', () => {
  const prevHome = process.env.HOME;
  process.env.HOME = 'C:\\Users\\xdx';
  try {
    assert.equal(platform('claude-code').globalPromptPath('claude-code', { header: false, os: 'win32' }), 'C:\\Users\\xdx\\.claude\\CLAUDE.md');
    assert.equal(platform('hermes').globalPromptPath('hermes', { os: 'win32' }), 'C:\\Users\\xdx\\.hermes\\SOUL.md');
  } finally {
    process.env.HOME = prevHome;
  }
});

// ---- WSL 双写：winTarget 隔离到 AEK_WIN_ROOT（临时目录），避免污染真实 Windows profile ----
function seedSource(source) {
  return async () => {
    await mkdir(sharedDir(source), { recursive: true });
    await mkdir(toolDir(source, 'codex'), { recursive: true });
    await writeFile(join(sharedDir(source), PLATFORM_FILE('cross_platform_shared')), '# shared\n', 'utf8');
    await writeFile(join(toolDir(source, 'codex'), PLATFORM_FILE('wsl')), '# codex-wsl\n', 'utf8');
    await writeFile(join(toolDir(source, 'codex'), PLATFORM_FILE('windows')), '# codex-win\n', 'utf8');
  };
}

test('WSL dual-write also patches Windows native profile path', async () => {
  if (!isWSL()) return; // 仅 WSL 环境验证双写
  const fakeHome = join(tmpdir(), 'gpm-win-dual-linux-' + Date.now());
  const winRoot = join(tmpdir(), 'gpm-win-dual-winroot-' + Date.now());
  const prevHome = process.env.HOME;
  const prevWinRoot = process.env.AEK_WIN_ROOT;
  process.env.HOME = fakeHome;
  process.env.AEK_WIN_ROOT = winRoot;
  try {
    await seedSource(MAPPING_SOURCE)();
    // tool 的 globalPromptPath 支持 options：
    const tool = {
      id: 'codex',
      name: 'Codex',
      globalPromptPath: (id, opts) => platform('codex').globalPromptPath(id, opts),
    };
    const target = tool.globalPromptPath('codex');
    assert.equal(target, join(fakeHome, '.codex', 'AGENTS.md'));

    const r = await patch(tool);
    assert.ok(r.winTarget, 'should compute a Windows native target in WSL');
    assert.ok(r.winTarget.startsWith(winRoot), `winTarget under AEK_WIN_ROOT: ${r.winTarget}`);

    // 两处都应被 patch
    let linux = await readFile(target, 'utf8');
    let win = await readFile(r.winTarget, 'utf8');
    assert.match(linux, /# codex-wsl/);
    assert.match(win, /# codex-wsl/);

    // 重复 patch -> replaced=true，且双写同步更新
    await writeFile(join(toolDir(MAPPING_SOURCE, 'codex'), PLATFORM_FILE('wsl')), '# codex-wsl-v2\n', 'utf8');
    const r2 = await patch(tool);
    assert.equal(r2.replaced, true);
    linux = await readFile(target, 'utf8');
    win = await readFile(r.winTarget, 'utf8');
    assert.match(linux, /# codex-wsl-v2/);
    assert.match(win, /# codex-wsl-v2/);

    // remove 也应双写清理
    const u = await unpatch(tool);
    assert.equal(u.removed, true);
    linux = await readFile(target, 'utf8');
    win = await readFile(r.winTarget, 'utf8');
    assert.equal(linux.includes('<!-- head-aek-pm-patch -->'), false);
    assert.equal(win.includes('<!-- head-aek-pm-patch -->'), false);
  } finally {
    process.env.HOME = prevHome;
    process.env.AEK_WIN_ROOT = prevWinRoot;
    await rm(fakeHome, { recursive: true, force: true });
    await rm(winRoot, { recursive: true, force: true });
  }
});