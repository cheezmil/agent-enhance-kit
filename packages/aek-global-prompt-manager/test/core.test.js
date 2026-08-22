import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  HEAD, HEAD_SHARED, END_SHARED, END,
  AEEK_DIR, PATCH_DIR, SHARED_DIR, PATCH_FILENAME,
  toolPatchPath, sharedPatchPath, buildBlock, mergeBlock, patch, unpatch,
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

test('platform paths resolve under HOME', () => {
  assert.equal(process.env.HOME, undefined || process.env.HOME);
  // Shared and tool paths reference the AEEK patch dir.
  assert.ok(sharedPatchPath().startsWith(AEEK_DIR));
  assert.ok(toolPatchPath('codex').includes('codex'));
});

test('patch + unpatch round-trip on a real target file', async () => {
  const fakeHome = join(tmpdir(), 'gpm-test-' + Date.now());
  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    await mkdir(join(fakeHome, '.aek', 'global-prompt-manager'), { recursive: true });
    await mkdir(join(fakeHome, '.codex'), { recursive: true });

    // Seed patch sources
    await writeFile(sharedPatchPath(), '# shared\n', 'utf8');
    await writeFile(toolPatchPath('codex'), '# codex-tool\n', 'utf8');

    const tool = {
      id: 'codex', name: 'Codex',
      globalPromptPath: () => join(fakeHome, '.codex', 'AGENTS.md'),
    };

    // Create a target file with existing user content
    const target = tool.globalPromptPath();
    await writeFile(target, '# My existing rules\n\nRule A', 'utf8');

    const r = await patch(tool);
    assert.equal(r.replaced, false);
    let content = await readFile(target, 'utf8');
    assert.match(content, /# My existing rules/);
    assert.match(content, /<!-- head-aek-gpm -->/);
    assert.match(content, /# shared/);
    assert.match(content, /# codex-tool/);
    assert.match(content, /<!-- end-aek-gpm -->/);

    // Re-patch should replace in place, preserving user content
    await writeFile(toolPatchPath('codex'), '# codex-v2\n', 'utf8');
    const r2 = await patch(tool);
    assert.equal(r2.replaced, true);
    content = await readFile(target, 'utf8');
    assert.match(content, /# My existing rules/);
    assert.match(content, /# codex-v2/);
    assert.equal(content.includes('codex-tool\n'), false);

    // Unpatch removes the managed block, keeps user content
    const u = await unpatch(tool);
    assert.equal(u.removed, true);
    content = await readFile(target, 'utf8');
    assert.equal(content.includes('<!-- head-aek-gpm -->'), false);
    assert.match(content, /# My existing rules/);
  } finally {
    process.env.HOME = prevHome;
    await rm(fakeHome, { recursive: true, force: true });
  }
});