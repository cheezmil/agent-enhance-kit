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

const EXPECTED_AGENTS = [
  'codex',
  'hermes',
  'claude',
  'gemini',
  'qwencode',
  'copilot',
  'vscode',
  'cursor',
  'cline',
  'windsurf',
  'roocode',
  'kilocode',
  'antigravity',
  'qoder',
  'kiro',
  'pi',
  'deepseek-harness',
  'openclaw',
  'zcode',
  'trae',
  'trae-cn',
  'opencode',
];

const TARGET_GROUP_BY_AGENT = {
  codex: 'AGENTS#md', qoder: 'AGENTS#md', pi: 'AGENTS#md',
  'deepseek-harness': 'AGENTS#md', openclaw: 'AGENTS#md', zcode: 'AGENTS#md', opencode: 'AGENTS#md',
  hermes: 'HERMES#md', claude: 'CLAUDE#md', gemini: 'GEMINI#md', qwencode: 'QWEN#md',
  copilot: '#github@copilot-instructions#md', vscode: '#github@copilot-instructions#md',
  cursor: '#cursor@rules@CURSOR#md', cline: '#cline@rules@CLINE#md', windsurf: '#windsurf@rules@WINDSURF#md',
  roocode: '#roo@rules@ROOCODE#md', kilocode: '#kilocode@rules@KILOCODE#md', antigravity: '#agents@rules@ANTIGRAVITY#md',
  kiro: '#kiro@steering@KIRO#md',
  trae: '#trae@rules@TRAE#md', 'trae-cn': '#trae-cn@rules@TRAE-CN#md',
};

function agentSourceRelPath(agent) {
  return join('for-certain-agents', TARGET_GROUP_BY_AGENT[agent], `${agent.toUpperCase()}.md`);
}

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

test('project rules agents align with skill-manager supported project agents', () => {
  assert.deepEqual(listProjectAgents(), EXPECTED_AGENTS);
});

test('init creates empty project-rules source and wrapper scripts', async () => {
  const root = join(tmpdir(), 'aekpr-init-' + Date.now());
  try {
    await withCwd(root, async () => {
      const res = await initProjectRules();
      assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'all-agent-must-comply.md'))));
      for (const agent of EXPECTED_AGENTS) {
        assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', agentSourceRelPath(agent)))), `missing ${agent}.md`);
        assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'scripts', `${agent}.mjs`))), `missing ${agent}.mjs`);
      }
      assert.equal(await readFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'all-agent-must-comply.md'), 'utf8'), '');
      assert.equal(await readFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'CLAUDE#md', 'CLAUDE.md'), 'utf8'), '');
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
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex extra\n', 'utf8');

      const first = await generateProjectRules('codex');
      assert.equal(first.generated, 1);
      assert.equal(first.writes.length, 1);
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(agents, /head-aek-project-rules/);
      assert.match(agents, /codex extra/);

      await writeFile(join(root, 'AGENTS.md'), '# user\n\n' + agents + '\n# tail\n', 'utf8');
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex extra v2\n', 'utf8');
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
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# only codex\n', 'utf8');

      await generateProjectRules('claude');
      const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.doesNotMatch(claude, /only codex/);
      assert.match(claude, /head-aek-project-rules/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('roocode and kilocode generate project rule files', async () => {
  const root = join(tmpdir(), 'aekpr-rules-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const roo = await generateProjectRules('roocode');
      const kilo = await generateProjectRules('kilocode');
      assert.equal(roo.writes.length, 1);
      assert.equal(kilo.writes.length, 1);
      assert.ok(/\.roo[\\/]+rules[\\/]+ROOCODE\.md$/.test(roo.writes[0].target));
      assert.ok(/\.kilocode[\\/]+rules[\\/]+KILOCODE\.md$/.test(kilo.writes[0].target));
      await readFile(join(root, '.roo', 'rules', 'ROOCODE.md'), 'utf8');
      await readFile(join(root, '.kilocode', 'rules', 'KILOCODE.md'), 'utf8');
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('all-agent targets are generated once even when agents share AGENTS.md', async () => {
  const root = join(tmpdir(), 'aekpr-shared-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'all-agent-must-comply.md'), '# shared project rules\n', 'utf8');

      const res = await generateProjectRules('all');
      const agentsWrites = res.writes.filter((w) => w.target.endsWith(join('AGENTS.md')));
      assert.equal(agentsWrites.length, 1);
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.equal((agents.match(/head-aek-project-rules/g) || []).length, 1);
      assert.match(agents, /# shared project rules/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PR_ROOT_DIR uses hyphens and all-agent source name', () => {
  assert.equal(PR_ROOT_DIR, 'project-rules');
});
