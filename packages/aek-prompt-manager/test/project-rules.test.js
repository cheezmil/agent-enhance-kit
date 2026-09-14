import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  initProjectRules,
  generateProjectRules,
  listProjectAgents,
  PR_ROOT_DIR,
} from '../src/project-rules.js';

async function withCwd(dir, fn) {
  const prev = process.cwd();
  await mkdir(dir, { recursive: true });
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

test('project rules agents include the requested tool set', () => {
  assert.deepEqual(listProjectAgents(), ['codex', 'claude', 'gemini', 'qwencode', 'roocode', 'kilocode']);
});

test('init creates project-rules source and wrapper scripts', async () => {
  const root = join(tmpdir(), 'aekpr-init-' + Date.now());
  try {
    await withCwd(root, async () => {
      const res = await initProjectRules();
      assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'all-agent-must-comply.md'))));
      assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'agents', 'claude.md'))));
      assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'scripts', 'all.mjs'))));
      const script = await readFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'scripts', 'codex.mjs'), 'utf8');
      assert.match(script, /aekpm[\s\S]*pr[\s\S]*gen[\s\S]*codex/s);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gen creates managed project prompt files and is idempotent', async () => {
  const root = join(tmpdir(), 'aekpr-gen-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'agents', 'codex.md'), '# codex extra\n', 'utf8');

      const first = await generateProjectRules('codex');
      assert.equal(first.generated, 1);
      assert.equal(first.writes.length, 1);
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(agents, /head-aek-pr-rules/);
      assert.match(agents, /codex extra/);

      await writeFile(join(root, 'AGENTS.md'), '# user\n\n' + agents + '\n# tail\n', 'utf8');
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'agents', 'codex.md'), '# codex extra v2\n', 'utf8');
      const second = await generateProjectRules('codex');
      assert.equal(second.writes[0].replaced, true);
      const updated = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(updated, /^# user/);
      assert.match(updated, /# tail/);
      assert.doesNotMatch(updated, /codex extra(?! v2)/);
      assert.match(updated, /codex extra v2/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('claude does not fall back to codex source', async () => {
  const root = join(tmpdir(), 'aekpr-claude-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'agents', 'codex.md'), '# only codex\n', 'utf8');

      await generateProjectRules('claude');
      const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.doesNotMatch(claude, /only codex/);
      assert.match(claude, /head-aek-pr-rules/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('roocode and kilocode generate five rule files each', async () => {
  const root = join(tmpdir(), 'aekpr-rules-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const roo = await generateProjectRules('roocode');
      const kilo = await generateProjectRules('kilocode');
      assert.equal(roo.writes.length, 5);
      assert.equal(kilo.writes.length, 5);
      assert.ok(roo.writes.some((w) => /\.roo[\\/]+rules-code[\\/]+rules\.md$/.test(w.target)));
      assert.ok(kilo.writes.some((w) => /\.kilocode[\\/]+rules-orchestrator[\\/]+rules\.md$/.test(w.target)));
      await readFile(join(root, '.roo', 'rules-code', 'rules.md'), 'utf8');
      await readFile(join(root, '.kilocode', 'rules-orchestrator', 'rules.md'), 'utf8');
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PR_ROOT_DIR uses hyphens and all-agent source name', () => {
  assert.equal(PR_ROOT_DIR, 'project-rules');
});
