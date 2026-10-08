import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  PLATFORMS,
  resolveSharedSkillsDir,
  resolveGenTargetDir,
  usesSharedGenDir,
  syncFromCenterRepo,
} from '../src/skills.js';

async function tmp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

const byId = (id) => PLATFORMS.find((p) => p.id === id);

test('usesSharedGenDir: mode 1 only for sharedAgentsDir platforms', () => {
  // 全局+项目都读 ~/.agents/skills 的工具（源码/官方文档逐个核实）
  for (const id of ['codex', 'cursor', 'vscode', 'copilot', 'gemini', 'opencode', 'windsurf', 'cline', 'pi', 'openclaw', 'deepseek-harness', 'qwencode', 'kilocode']) {
    assert.equal(usesSharedGenDir(byId(id), 1), true, `${id} 应共用`);
  }
  // 只在项目级读 .agents（全局用各自目录）→ 按不共用处理
  assert.equal(usesSharedGenDir(byId('antigravity'), 1), false);
  // hermes / antigravity 仅项目级共用，全局不共用
  assert.equal(usesSharedGenDir(byId('hermes'), 1, 'project'), true);
  assert.equal(usesSharedGenDir(byId('hermes'), 1, 'global'), false);
  assert.equal(usesSharedGenDir(byId('antigravity'), 1, 'project'), true);
  // both 类工具两种 scope 都共用
  assert.equal(usesSharedGenDir(byId('codex'), 1, 'project'), true);
  assert.equal(usesSharedGenDir(byId('codex'), 1, 'global'), true);
  // 源码核实为不共用
  assert.equal(usesSharedGenDir(byId('continue'), 1, 'project'), false);
  // 闭源、官方文档只列自有目录
  assert.equal(usesSharedGenDir(byId('claude'), 1), false);
  assert.equal(usesSharedGenDir(byId('zcode'), 1), false);
  // mode 2 永远走自有目录
  assert.equal(usesSharedGenDir(byId('codex'), 2), false);
});

test('resolveSharedSkillsDir honors scope and target OS', async (t) => {
  const home = await tmp('aek-sm-shared-');
  t.after(() => rm(home, { recursive: true, force: true }));

  assert.equal(
    resolveSharedSkillsDir({ scope: 'global', home, platformOS: 'darwin' }),
    path.join(home, '.agents', 'skills'),
  );
  assert.match(
    resolveSharedSkillsDir({ scope: 'global', home, platformOS: 'win32' }),
    /\\\.agents\\skills$/,
  );
});

test('resolveGenTargetDir routes shared vs own by mode', async (t) => {
  const home = await tmp('aek-sm-shared-');
  t.after(() => rm(home, { recursive: true, force: true }));
  const opts = { scope: 'global', home, platformOS: 'darwin' };

  // 共享工具：mode1 -> .agents/skills，mode2 -> .codex/skills
  assert.equal(resolveGenTargetDir(byId('codex'), { ...opts, mode: 1 }), path.join(home, '.agents', 'skills'));
  assert.equal(resolveGenTargetDir(byId('codex'), { ...opts, mode: 2 }), path.join(home, '.codex', 'skills'));
  // 非共享工具：两种模式都写自有目录
  assert.equal(resolveGenTargetDir(byId('claude'), { ...opts, mode: 1 }), path.join(home, '.claude', 'skills'));
  assert.equal(resolveGenTargetDir(byId('claude'), { ...opts, mode: 2 }), path.join(home, '.claude', 'skills'));
});

// 在临时 home 布一个中心仓库 skill，跑真实同步，断言落盘位置
async function seedCenter(home) {
  const skills = path.join(home, '.aek', 'skill-manager', 'skills');
  await mkdir(path.join(skills, 'alpha'), { recursive: true });
  await writeFile(path.join(skills, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\n');
  return skills;
}

async function hasSkill(dir, name) {
  try {
    const entries = await readdir(dir);
    return entries.includes(name);
  } catch {
    return false;
  }
}

test('genTargetMode=1: shared tools write only to ~/.agents/skills, others keep own dir', async (t) => {
  const home = await tmp('aek-sm-genmode1-');
  t.after(() => rm(home, { recursive: true, force: true }));
  await seedCenter(home);

  const tools = ['codex', 'cursor', 'claude'];
  const { results } = await syncFromCenterRepo({ scope: 'global', home, tools, genTargetMode: 1, useRecord: false });

  const sharedDir = path.join(home, '.agents', 'skills');
  // 共享目录收到 alpha（codex/cursor 只真正写一次）
  assert.equal(await hasSkill(sharedDir, 'alpha'), true);
  // codex/cursor 自有目录不应被写入
  assert.equal(await hasSkill(path.join(home, '.codex', 'skills'), 'alpha'), false);
  assert.equal(await hasSkill(path.join(home, '.cursor', 'skills'), 'alpha'), false);
  // claude 非共享，写自有目录
  assert.equal(await hasSkill(path.join(home, '.claude', 'skills'), 'alpha'), true);

  // 共享去重：两个共享工具中只有一个真正复制过，另一个标记 shared
  const codex = results.find((r) => r.platform?.id === 'codex');
  const cursor = results.find((r) => r.platform?.id === 'cursor');
  const realCopies = [codex, cursor].filter((r) => r.copied.includes('alpha'));
  assert.equal(realCopies.length, 1, '共用目录应只复制一次');
  assert.equal([codex, cursor].filter((r) => r.shared).length, 1);
});

test('genTargetMode=2 (默认): 所有工具写各自目录，共用目录不受影响', async (t) => {
  const home = await tmp('aek-sm-genmode2-');
  t.after(() => rm(home, { recursive: true, force: true }));
  await seedCenter(home);

  const tools = ['codex', 'claude'];
  await syncFromCenterRepo({ scope: 'global', home, tools, useRecord: false });

  assert.equal(await hasSkill(path.join(home, '.codex', 'skills'), 'alpha'), true);
  assert.equal(await hasSkill(path.join(home, '.claude', 'skills'), 'alpha'), true);
  assert.equal(await hasSkill(path.join(home, '.agents', 'skills'), 'alpha'), false);
});
