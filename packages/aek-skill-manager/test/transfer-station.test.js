import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  parseJsonc,
  stringifyJsonc,
  loadConfig,
  updateConfig,
  getConfigPath,
} from '../src/config.js';
import {
  getLatestMtime,
  pruneBackups,
  transferSync,
} from '../src/transfer-station.js';

async function tmp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

// ---------- config ----------

test('parseJsonc handles comments and trailing commas', () => {
  const obj = parseJsonc(`{
    // comment
    "a": 1,
    "b": "x", // trailing
  }`);
  assert.equal(obj.a, 1);
  assert.equal(obj.b, 'x');
});

test('parseJsonc returns {} for invalid input', () => {
  assert.deepEqual(parseJsonc('not json'), {});
  assert.deepEqual(parseJsonc(''), {});
});

test('stringifyJsonc keeps comments', () => {
  const raw = `{
  // hello
  "a": 1
}
`;
  const obj = parseJsonc(raw);
  obj.a = 2;
  const out = stringifyJsonc(obj, raw);
  assert.match(out, /\/\/ hello/);
  assert.match(out, /"a": 2/);
});

test('loadConfig returns defaults when missing', async (t) => {
  const home = await tmp('aek-sm-config-');
  t.after(() => rm(home, { recursive: true, force: true }));
  const cfg = await loadConfig({ home });
  assert.equal(cfg.transferSyncBeforeSync, true);
  assert.equal(cfg.transferBackupKeep, 3);
});

test('updateConfig writes and loadConfig reads back', async (t) => {
  const home = await tmp('aek-sm-config-');
  t.after(() => rm(home, { recursive: true, force: true }));
  await updateConfig({ transferBackupKeep: 5, wslDistro: 'Ubuntu-22.04' }, { home });
  const cfg = await loadConfig({ home });
  assert.equal(cfg.transferBackupKeep, 5);
  assert.equal(cfg.wslDistro, 'Ubuntu-22.04');
  assert.equal(getConfigPath({ home }), path.join(home, '.aek', 'skill-manager', 'settings.jsonc'));
});

// ---------- transfer-station ----------

test('getLatestMtime finds newest file recursively', async (t) => {
  const dir = await tmp('aek-sm-mtime-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'a.txt'), 'a');
  await writeFile(path.join(dir, 'sub', 'b.txt'), 'b');
  const now = Date.now() / 1000;
  await utimes(path.join(dir, 'a.txt'), now - 100, now - 100);
  await utimes(path.join(dir, 'sub', 'b.txt'), now, now);
  const latest = await getLatestMtime(dir);
  assert.ok(latest > now - 10, `latest ${latest} should be near ${now}`);
});

test('getLatestMtime returns 0 for missing dir', async () => {
  const dir = path.join(os.tmpdir(), 'aek-sm-missing-xyz');
  assert.equal(await getLatestMtime(dir), 0);
});

test('pruneBackups keeps only N most recent', async (t) => {
  const dir = await tmp('aek-sm-prune-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const backupRoot = path.join(dir, 'backup');
  await mkdir(backupRoot, { recursive: true });
  for (let i = 0; i < 5; i += 1) {
    await mkdir(path.join(backupRoot, `skills.bak.2026-01-0${i + 1}T00-00-00`), { recursive: true });
  }
  await pruneBackups(backupRoot, 2);
  const remaining = (await readdir(backupRoot)).filter((e) => e.startsWith('skills.bak.')).sort();
  assert.equal(remaining.length, 2);
  assert.match(remaining[0], /2026-01-04/);
  assert.match(remaining[1], /2026-01-05/);
});

test('transferSync skips when peer is unreachable', async (t) => {
  const { isWSL } = await import('@cheezmil/aek-common');
  if (process.platform === 'win32' || isWSL()) {
    t.skip('仅在非 WSL/非 Windows 环境测试跳过逻辑');
    return;
  }
  const home = await tmp('aek-sm-transfer-');
  t.after(() => rm(home, { recursive: true, force: true }));
  const result = await transferSync({ home, env: {} });
  assert.equal(result.action, 'skipped');
});

// WSL 环境模拟：强制 AEK_WIN_ROOT 指向一个临时目录作为"Windows 侧"
test('transferSync aligns WSL -> Windows when local is newer', async (t) => {
  if (process.platform !== 'linux') return; // 仅在 Linux/WSL 测试
  const wslHome = await tmp('aek-sm-wsl-');
  const winHome = await tmp('aek-sm-win-');
  t.after(() => Promise.all([
    rm(wslHome, { recursive: true, force: true }),
    rm(winHome, { recursive: true, force: true }),
  ]));

  const wslSkills = path.join(wslHome, '.aek', 'skill-manager', 'skills');
  const winSkills = path.join(winHome, '.aek', 'skill-manager', 'skills');
  await mkdir(path.join(wslSkills, 'alpha'), { recursive: true });
  await writeFile(path.join(wslSkills, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n');
  await mkdir(path.join(winSkills, 'beta'), { recursive: true });
  await writeFile(path.join(winSkills, 'beta', 'SKILL.md'), '---\nname: beta\n---\n');

  // 让 WSL 侧更新
  const now = Date.now() / 1000;
  await utimes(path.join(wslSkills, 'alpha', 'SKILL.md'), now, now);
  await utimes(path.join(winSkills, 'beta', 'SKILL.md'), now - 100, now - 100);

  const result = await transferSync({
    home: wslHome,
    env: { AEK_WIN_ROOT: winHome },
  });

  assert.equal(result.action, 'copied');
  assert.equal(result.direction, 'local-to-peer');
  assert.ok(result.backupDir);
  assert.equal(result.prunedBackups, 0);
  // Windows 侧应收到 alpha，beta 被覆盖（整目录覆盖）
  const winEntries = await readdir(winSkills);
  assert.ok(winEntries.includes('alpha'));
  assert.ok(!winEntries.includes('beta'));
});

test('transferSync aligns Windows -> WSL when peer is newer', async (t) => {
  if (process.platform !== 'linux') return;
  const wslHome = await tmp('aek-sm-wsl-');
  const winHome = await tmp('aek-sm-win-');
  t.after(() => Promise.all([
    rm(wslHome, { recursive: true, force: true }),
    rm(winHome, { recursive: true, force: true }),
  ]));

  const wslSkills = path.join(wslHome, '.aek', 'skill-manager', 'skills');
  const winSkills = path.join(winHome, '.aek', 'skill-manager', 'skills');
  await mkdir(path.join(wslSkills, 'old'), { recursive: true });
  await writeFile(path.join(wslSkills, 'old', 'SKILL.md'), '---\nname: old\n---\n');
  await mkdir(path.join(winSkills, 'new'), { recursive: true });
  await writeFile(path.join(winSkills, 'new', 'SKILL.md'), '---\nname: new\n---\n');

  const now = Date.now() / 1000;
  await utimes(path.join(wslSkills, 'old', 'SKILL.md'), now - 100, now - 100);
  await utimes(path.join(winSkills, 'new', 'SKILL.md'), now, now);

  const result = await transferSync({
    home: wslHome,
    env: { AEK_WIN_ROOT: winHome },
  });

  assert.equal(result.action, 'copied');
  assert.equal(result.direction, 'peer-to-local');
  const wslEntries = await readdir(wslSkills);
  assert.ok(wslEntries.includes('new'));
  assert.ok(!wslEntries.includes('old'));
});

test('transferSync noop when both empty', async (t) => {
  if (process.platform !== 'linux') return;
  const wslHome = await tmp('aek-sm-wsl-');
  const winHome = await tmp('aek-sm-win-');
  t.after(() => Promise.all([
    rm(wslHome, { recursive: true, force: true }),
    rm(winHome, { recursive: true, force: true }),
  ]));
  await mkdir(path.join(wslHome, '.aek', 'skill-manager', 'skills'), { recursive: true });
  await mkdir(path.join(winHome, '.aek', 'skill-manager', 'skills'), { recursive: true });

  const result = await transferSync({
    home: wslHome,
    env: { AEK_WIN_ROOT: winHome },
  });
  assert.equal(result.action, 'noop');
});

test('transferSync force copies even when same mtime', async (t) => {
  if (process.platform !== 'linux') return;
  const wslHome = await tmp('aek-sm-wsl-');
  const winHome = await tmp('aek-sm-win-');
  t.after(() => Promise.all([
    rm(wslHome, { recursive: true, force: true }),
    rm(winHome, { recursive: true, force: true }),
  ]));
  const wslSkills = path.join(wslHome, '.aek', 'skill-manager', 'skills');
  const winSkills = path.join(winHome, '.aek', 'skill-manager', 'skills');
  await mkdir(path.join(wslSkills, 'a'), { recursive: true });
  await writeFile(path.join(wslSkills, 'a', 'SKILL.md'), '---\nname: a\n---\n');
  await mkdir(path.join(winSkills, 'a'), { recursive: true });
  await writeFile(path.join(winSkills, 'a', 'SKILL.md'), '---\nname: a\n---\n');

  const result = await transferSync({
    home: wslHome,
    env: { AEK_WIN_ROOT: winHome },
    force: true,
  });
  assert.equal(result.action, 'copied');
  assert.equal(result.direction, 'local-to-peer');
});
