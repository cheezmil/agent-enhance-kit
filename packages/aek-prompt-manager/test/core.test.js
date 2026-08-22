import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  HEAD, HEAD_SHARED, END_SHARED, END,
  aekDir, sharedDir, toolDir,
  MAPPING_SOURCE, ONLY_PATCH_SOURCE,
  PLATFORM_FILES, PLATFORM_FILE,
  currentPlatform, isWSL,
  readPlatformBundle, buildBlock, mergeBlock, patch, apply, unpatch,
} from '../src/core.js';

test('buildBlock wraps shared before tool-specific content', () => {
  const block = buildBlock('codex', 'SHARED LINE', 'TOOL LINE');
  assert.match(block, /<!-- head-aek-gpm -->[\s\S]*<!-- head-aek-gpm-shared -->/);
  assert.match(block, /SHARED LINE[\s\S]*TOOL LINE/);
  assert.match(block, /<!-- end-aek-gpm-shared -->[\s\S]*<!-- end-aek-gpm-codex -->[\s\S]*<!-- end-aek-gpm -->/);
});

test('buildBlock works with empty shared or tool content', () => {
  const onlyTool = buildBlock('codex', '', 'TOOL LINE');
  assert.equal(onlyTool.includes('SHARED'), false);
  assert.match(onlyTool, /<!-- head-aek-gpm-codex -->/);
  const onlyShared = buildBlock('codex', 'SHARED LINE', '');
  assert.match(onlyShared, /<!-- head-aek-gpm-shared -->/);
  assert.equal(onlyShared.includes('head-aek-gpm-codex'), false);
});

test('mergeBlock appends when no existing block', () => {
  const { content, replaced } = mergeBlock('', 'codex', 'SH', 'TO');
  assert.equal(replaced, false);
  assert.match(content, /<!-- head-aek-gpm -->/);
});

test('mergeBlock replaces existing block in place', () => {
  const old = buildBlock('codex', 'OLD SH', 'OLD TO');
  const prefix = '# user top\n\n';
  const suffix = '\n\n# user bottom';
  const { content, replaced } = mergeBlock(
    prefix + old + suffix, 'codex', 'NEW SH', 'NEW TO',
  );
  assert.equal(replaced, true);
  assert.equal(content.includes('OLD'), false);
  assert.match(content, /^# user top/);
  assert.match(content, /# user bottom$/);
  assert.match(content, /NEW SH[\s\S]*NEW TO/);
});

test('source dir layout resolves under HOME and tool dir uses underscores', () => {
  assert.ok(sharedDir(MAPPING_SOURCE).includes('all_agents_shared'));
  assert.ok(sharedDir(ONLY_PATCH_SOURCE).includes('all_agents_shared'));
  assert.ok(toolDir(MAPPING_SOURCE, 'claude-code').endsWith('claude_code'));
  assert.ok(toolDir(ONLY_PATCH_SOURCE, 'opencode').endsWith('opencode'));
  assert.ok(aekDir().endsWith('prompt-manager'));
});

test('readPlatformBundle merges cross-platform + current platform, skips empty', async () => {
  const tmp = join(tmpdir(), 'gpm-bundle-' + Date.now());
  try {
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, PLATFORM_FILE('cross_platform_shared')), '# cross\n', 'utf8');
    await writeFile(join(tmp, PLATFORM_FILE('linux')), '# linux\n', 'utf8');
    const plat = process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : (isWSL() ? 'wsl' : 'linux'));
    const bundle = await readPlatformBundle(tmp, plat);
    assert.match(bundle, /# cross/);
    if (plat === 'linux') assert.match(bundle, /# linux/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('platform_files is exactly the five platform fragments', () => {
  assert.deepEqual(PLATFORM_FILES, ['cross_platform_shared', 'linux', 'mac', 'windows', 'wsl']);
});

function seedSource(source) {
  return async () => {
    await mkdir(sharedDir(source), { recursive: true });
    await mkdir(toolDir(source, 'codex'), { recursive: true });
    await writeFile(join(sharedDir(source), PLATFORM_FILE('cross_platform_shared')), '# shared-cross\n', 'utf8');
    await writeFile(join(toolDir(source, 'codex'), PLATFORM_FILE('linux')), '# codex-linux\n', 'utf8');
    await writeFile(join(toolDir(source, 'codex'), PLATFORM_FILE('wsl')), '# codex-wsl\n', 'utf8');
  };
}

test('patch (mapping source) round-trip on a real target file', async () => {
  const fakeHome = join(tmpdir(), 'gpm-map-' + Date.now());
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    await seedSource(MAPPING_SOURCE)();
    await mkdir(join(fakeHome, '.codex'), { recursive: true });
    const tool = { id: 'codex', name: 'Codex', globalPromptPath: () => join(fakeHome, '.codex', 'AGENTS.md') };
    const target = tool.globalPromptPath();
    await writeFile(target, '# My rules\n\nRule A', 'utf8');

    const r = await patch(tool);
    assert.equal(r.replaced, false);
    assert.equal(r.source, MAPPING_SOURCE);
    let content = await readFile(target, 'utf8');
    assert.match(content, /# My rules/);
    assert.match(content, /<!-- head-aek-gpm -->/);
    assert.match(content, /# shared-cross/);
    // WSL host loads wsl fragment
    assert.match(content, /# codex-wsl/);
    assert.match(content, /<!-- end-aek-gpm -->/);

    await writeFile(join(toolDir(MAPPING_SOURCE, 'codex'), PLATFORM_FILE('linux')), '# codex-linux-v2\n', 'utf8');
    await writeFile(join(toolDir(MAPPING_SOURCE, 'codex'), PLATFORM_FILE('wsl')), '# codex-wsl-v2\n', 'utf8');
    const r2 = await patch(tool);
    assert.equal(r2.replaced, true);
    content = await readFile(target, 'utf8');
    assert.match(content, /# My rules/);
    assert.match(content, /# codex-wsl-v2/);
    assert.equal(content.includes('codex-wsl\n'), false);

    const u = await unpatch(tool);
    assert.equal(u.removed, true);
    content = await readFile(target, 'utf8');
    assert.equal(content.includes('<!-- head-aek-gpm -->'), false);
    assert.match(content, /# My rules/);
  } finally {
    process.env.HOME = prevHome;
    await rm(fakeHome, { recursive: true, force: true });
  }
});

test('apply (only-patch source) appends block, repeat replaces in place', async () => {
  const fakeHome = join(tmpdir(), 'gpm-app-' + Date.now());
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    await seedSource(ONLY_PATCH_SOURCE)();
    await mkdir(join(fakeHome, '.codex'), { recursive: true });
    const tool = { id: 'codex', name: 'Codex', globalPromptPath: () => join(fakeHome, '.codex', 'AGENTS.md') };
    const target = tool.globalPromptPath();
    await writeFile(target, '# Existing prompt\n', 'utf8');

    const r = await apply(tool);
    assert.equal(r.replaced, false);
    assert.equal(r.source, ONLY_PATCH_SOURCE);
    let content = await readFile(target, 'utf8');
    assert.match(content, /# Existing prompt/);
    assert.match(content, /<!-- head-aek-gpm -->/);
    assert.match(content, /# shared-cross/);
    assert.match(content, /# codex-wsl/);

    await writeFile(join(toolDir(ONLY_PATCH_SOURCE, 'codex'), PLATFORM_FILE('wsl')), '# codex-wsl-updated\n', 'utf8');
    const r2 = await apply(tool);
    assert.equal(r2.replaced, true);
    content = await readFile(target, 'utf8');
    assert.match(content, /# codex-wsl-updated/);
    assert.equal(content.includes('codex-wsl\n'), false);
  } finally {
    process.env.HOME = prevHome;
    await rm(fakeHome, { recursive: true, force: true });
  }
});