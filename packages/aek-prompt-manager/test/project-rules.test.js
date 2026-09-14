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
      assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'ALL-AGENTS-MUST-COMPLY.md'))));
      for (const agent of EXPECTED_AGENTS) {
        assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', agentSourceRelPath(agent)))), `missing ${agent}.md`);
        assert.ok(res.files.some((f) => f.path.endsWith(join('.aek', 'prompt-manager', 'project-rules', 'scripts', `${agent}.mjs`))), `missing ${agent}.mjs`);
      }
      assert.equal(await readFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'ALL-AGENTS-MUST-COMPLY.md'), 'utf8'), '');
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
      assert.match(agents, /codex extra/);

      // 第二次生成应该覆盖整个文件（不带前缀内容）
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex extra v2\n', 'utf8');
      const second = await generateProjectRules('codex');
      assert.equal(second.writes[0].replaced, true);
      const updated = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(updated, /codex extra v2/);
      assert.doesNotMatch(updated, /^# user/);  // 不应该有旧前缀
      assert.doesNotMatch(updated, /# tail/);  // 不应该有旧后缀
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
      // CLAUDE.md 只读 CLAUDE#md/CLAUDE.md 源，不会 fallback 到 codex 源
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
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'ALL-AGENTS-MUST-COMPLY.md'), '# shared project rules\n', 'utf8');

      const res = await generateProjectRules('all');
      const agentsWrites = res.writes.filter((w) => w.target.endsWith(join('AGENTS.md')));
      assert.equal(agentsWrites.length, 1);
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(agents, /# shared project rules/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PR_ROOT_DIR uses hyphens and all-agent source name', () => {
  assert.equal(PR_ROOT_DIR, 'project-rules');
});

test('gen writes per-agent sub-blocks sorted A-Z inside one block', async () => {
  const root = join(tmpdir(), 'aekpr-subblocks-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const pr = join(root, '.aek', 'prompt-manager', 'project-rules');
      await writeFile(join(pr, 'ALL-AGENTS-MUST-COMPLY.md'), '# shared\n', 'utf8');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex part\n', 'utf8');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'QODER.md'), '# qoder part\n', 'utf8');

      await generateProjectRules('all');
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      // all 内容只出现一次
      assert.equal((agents.match(/# shared/g) || []).length, 1);
      // 子块存在且按文件名 A-Z 排列（CODEX < QODER）
      const codexIdx = agents.indexOf('<!-- head-codex -->');
      const qoderIdx = agents.indexOf('<!-- head-qoder -->');
      assert.ok(codexIdx !== -1 && qoderIdx !== -1);
      assert.ok(codexIdx < qoderIdx);
      assert.match(agents, /<!-- end-codex -->/);
      assert.match(agents, /# codex part/);
      assert.match(agents, /# qoder part/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gen single agent updates only its own sub-block and keeps others', async () => {
  const root = join(tmpdir(), 'aekpr-incr-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const pr = join(root, '.aek', 'prompt-manager', 'project-rules');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex v1\n', 'utf8');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'QODER.md'), '# qoder v1\n', 'utf8');
      await generateProjectRules('all');

      // 单 agent 更新：codex 变 v2，qoder 必须原样保留
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex v2\n', 'utf8');
      await generateProjectRules('codex');
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(agents, /# codex v2/);
      assert.doesNotMatch(agents, /# codex v1/);
      assert.match(agents, /# qoder v1/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('empty all-content still writes sub-blocks', async () => {
  const root = join(tmpdir(), 'aekpr-empty-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      await writeFile(join(root, '.aek', 'prompt-manager', 'project-rules', 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex only\n', 'utf8');

      await generateProjectRules('all');
      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
      assert.match(agents, /# codex only/);
      // 不应该有旧的前后缀
      assert.doesNotMatch(agents, /^# user/);
      assert.doesNotMatch(agents, /# tail$/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
