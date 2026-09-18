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
import { prBackupDir } from '../src/project-rules.js';

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
  // 创建 .git 目录使目录成为 git repo（findGitRoot 需要）
  await mkdir(join(dir, '.git'), { recursive: true });
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

test('gen single agent rewrites the whole file (stale content is discarded)', async () => {
  const root = join(tmpdir(), 'aekpr-incr-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const pr = join(root, '.aek', 'prompt-manager', 'project-rules');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex v1\n', 'utf8');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'QODER.md'), '# qoder v1\n', 'utf8');
      await generateProjectRules('all');

      // 整文件覆盖：旧的游离内容必须消失，同组其他 agent 子块从源重建
      const agentsFile = join(root, 'AGENTS.md');
      const prev = await readFile(agentsFile, 'utf8');
      await writeFile(agentsFile, `${prev}\n# stray stale content\n`, 'utf8');
      await writeFile(join(pr, 'for-certain-agents', 'AGENTS#md', 'CODEX.md'), '# codex v2\n', 'utf8');
      await generateProjectRules('codex');
      const agents = await readFile(agentsFile, 'utf8');
      assert.match(agents, /# codex v2/);
      assert.doesNotMatch(agents, /# codex v1/);
      assert.doesNotMatch(agents, /stray stale content/);
      assert.match(agents, /# qoder v1/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gen backs up old non-empty file and keeps at most 2 backups', async () => {
  const root = join(tmpdir(), 'aekpr-backup-' + Date.now());
  try {
    await withCwd(root, async () => {
      await initProjectRules();
      const agentsFile = join(root, 'AGENTS.md');
      const backupDir = prBackupDir(root);

      // 旧文件非空 -> 备份到 prRoot/backup/AGENTS.md.bak.1
      await writeFile(agentsFile, '# stale v1\n', 'utf8');
      await generateProjectRules('all');
      assert.equal(await readFile(join(backupDir, 'AGENTS.md.bak.1'), 'utf8'), '# stale v1\n');

      // 再覆盖 -> 轮转：bak.1 是最新被覆盖的内容
      await writeFile(agentsFile, '# stale v2\n', 'utf8');
      await generateProjectRules('all');
      assert.equal(await readFile(join(backupDir, 'AGENTS.md.bak.1'), 'utf8'), '# stale v2\n');
      assert.equal(await readFile(join(backupDir, 'AGENTS.md.bak.2'), 'utf8'), '# stale v1\n');

      // 第三次覆盖 -> 仍然只有 2 份备份
      await writeFile(agentsFile, '# stale v3\n', 'utf8');
      await generateProjectRules('all');
      assert.equal(await readFile(join(backupDir, 'AGENTS.md.bak.1'), 'utf8'), '# stale v3\n');
      assert.equal(await readFile(join(backupDir, 'AGENTS.md.bak.2'), 'utf8'), '# stale v2\n');
      await assert.rejects(readFile(join(backupDir, 'AGENTS.md.bak.3'), 'utf8'), /ENOENT/);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('init and gen reject when not in a git repo', async () => {
  const root = join(tmpdir(), 'aekpr-nogit-' + Date.now());
  try {
    await mkdir(root, { recursive: true });
    // NOT creating .git — this dir is outside any repo
    const errInit = await initProjectRules(root).then(
      () => null,
      (e) => e
    );
    assert.ok(errInit instanceof Error);
    assert.match(errInit.message, /git/);

    const errGen = await generateProjectRules('all', root).then(
      () => null,
      (e) => e
    );
    assert.ok(errGen instanceof Error);
    assert.match(errGen.message, /git/);
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
