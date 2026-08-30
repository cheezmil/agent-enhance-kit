import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLATFORMS, resolveSkillsDir, resolveWindowsNativeSkillsDir } from '../src/skills.js';

function platform(id) {
  const found = PLATFORMS.find((entry) => entry.id === id);
  assert.ok(found, `platform ${id} should exist`);
  return found;
}

test('global skills dirs resolve under the home directory on linux', () => {
  const opts = { scope: 'global', platformOS: 'linux', home: '/home/u' };
  assert.equal(resolveSkillsDir(platform('claude'), opts), '/home/u/.claude/skills');
  assert.equal(resolveSkillsDir(platform('codex'), opts), '/home/u/.codex/skills');
  assert.equal(resolveSkillsDir(platform('cursor'), opts), '/home/u/.cursor/skills');
  assert.equal(resolveSkillsDir(platform('gemini'), opts), '/home/u/.gemini/skills');
  assert.equal(resolveSkillsDir(platform('copilot'), opts), '/home/u/.copilot/skills');
  assert.equal(resolveSkillsDir(platform('opencode'), opts), '/home/u/.config/opencode/skills');
});

test('vscode shares the copilot global skills directory', () => {
  const opts = { scope: 'global', platformOS: 'linux', home: '/home/u' };
  assert.equal(
    resolveSkillsDir(platform('vscode'), opts),
    resolveSkillsDir(platform('copilot'), opts),
  );
});

test('macOS global dirs match linux for these platforms', () => {
  const opts = { scope: 'global', platformOS: 'darwin', home: '/Users/u' };
  assert.equal(resolveSkillsDir(platform('claude'), opts), '/Users/u/.claude/skills');
  assert.equal(resolveSkillsDir(platform('opencode'), opts), '/Users/u/.config/opencode/skills');
});

test('windows home-based platforms resolve under %USERPROFILE%', () => {
  const opts = { scope: 'global', platformOS: 'win32', home: 'C:\\Users\\u', env: {} };
  assert.equal(resolveSkillsDir(platform('claude'), opts), 'C:\\Users\\u\\.claude\\skills');
  assert.equal(resolveSkillsDir(platform('codex'), opts), 'C:\\Users\\u\\.codex\\skills');
});

test('windows opencode resolves under LOCALAPPDATA', () => {
  const opts = {
    scope: 'global',
    platformOS: 'win32',
    home: 'C:\\Users\\u',
    env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
  };
  assert.equal(
    resolveSkillsDir(platform('opencode'), opts),
    'C:\\Users\\u\\AppData\\Local\\opencode\\skills',
  );
});

test('windows hermes resolves under LOCALAPPDATA', () => {
  const opts = {
    scope: 'global',
    platformOS: 'win32',
    home: 'C:\\Users\\u',
    env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
  };
  assert.equal(
    resolveSkillsDir(platform('hermes'), opts),
    'C:\\Users\\u\\AppData\\Local\\hermes\\skills',
  );
});

test('project scope resolves under the working directory', () => {
  const opts = { scope: 'project', platformOS: 'linux', cwd: '/work/proj' };
  assert.equal(resolveSkillsDir(platform('claude'), opts), '/work/proj/.claude/skills');
  assert.equal(resolveSkillsDir(platform('codex'), opts), '/work/proj/.agents/skills');
  assert.equal(resolveSkillsDir(platform('copilot'), opts), '/work/proj/.github/skills');
  assert.equal(resolveSkillsDir(platform('opencode'), opts), '/work/proj/.opencode/skills');
});

test('resolveWindowsNativeSkillsDir maps home-based platforms under winRoot', () => {
  const opts = { scope: 'global', winRoot: '/mnt/c/Users/xdx' };
  assert.equal(resolveWindowsNativeSkillsDir(platform('claude'), opts), '/mnt/c/Users/xdx/.claude/skills');
  assert.equal(resolveWindowsNativeSkillsDir(platform('codex'), opts), '/mnt/c/Users/xdx/.codex/skills');
  assert.equal(resolveWindowsNativeSkillsDir(platform('vscode'), opts), '/mnt/c/Users/xdx/.copilot/skills');
});

test('resolveWindowsNativeSkillsDir maps localappdata platforms (hermes/opencode)', () => {
  const opts = { scope: 'global', winRoot: '/mnt/c/Users/xdx' };
  // hermes / opencode 在 win 布局用 LOCALAPPDATA
  assert.equal(
    resolveWindowsNativeSkillsDir(platform('hermes'), opts),
    '/mnt/c/Users/xdx/AppData/Local/hermes/skills',
  );
  assert.equal(
    resolveWindowsNativeSkillsDir(platform('opencode'), opts),
    '/mnt/c/Users/xdx/AppData/Local/opencode/skills',
  );
});

test('resolveWindowsNativeSkillsDir returns empty for project scope or no winRoot', () => {
  assert.equal(resolveWindowsNativeSkillsDir(platform('claude'), { scope: 'project', winRoot: '/mnt/c/Users/xdx' }), '');
  assert.equal(resolveWindowsNativeSkillsDir(platform('claude'), { scope: 'global', winRoot: '' }), '');
});
