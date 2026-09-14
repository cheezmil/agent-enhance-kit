// aek-prompt-manager — project rules generation
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

export const PR_ROOT_DIR = 'project-rules';
export const AGENTS_DIR = 'for-certain-agents';
export const SCRIPTS_DIR = 'scripts';
export const ALL_AGENT_FILE = 'ALL-AGENTS-MUST-COMPLY.md';
export const PR_HEAD = '<!-- head-aek-prompt-manager -->';
export const PR_END = '<!-- end-aek-prompt-manager -->';
// 旧版标记（迁移用）：遇到旧块整体按新结构重建
const LEGACY_HEAD = '<!-- head-aek-project-rules -->';
const LEGACY_END = '<!-- end-aek-project-rules -->';

function subBlockHead(agentId) {
  return `<!-- head-${agentId} -->`;
}
function subBlockEnd(agentId) {
  return `<!-- end-${agentId} -->`;
}

// 目录名禁止出现点号和路径分隔符，目标相对路径里的 `.` 一律用 `#` 表示、
// 目录分隔符一律用 `@` 表示，并保留原始大小写：
//   AGENTS.md                      -> AGENTS#md
//   .github/copilot-instructions.md -> #github@copilot-instructions#md
//   .cursor/rules/aekpm.md          -> #cursor@rules@aekpm#md
// 每个 agent 的源 md 收进以其目标相对路径命名的子目录，一眼即可看出提示词生成到哪里。
export function targetGroupDir(targetRelPath) {
  return targetRelPath.replace(/\\/g, '/').split('/').join('@').replace(/\./g, '#');
}

function projectTarget(relativePath) {
  const fn = (projectRoot) => [join(projectRoot, relativePath)];
  fn.relPath = relativePath;
  return fn;
}

export const PROJECT_AGENTS = {
  all: {
    displayName: 'all',
    targets: () => ['__all_targets__'],
  },
  codex: {
    displayName: 'Codex',
    targets: projectTarget('AGENTS.md'),
  },
  hermes: {
    displayName: 'Hermes',
    targets: projectTarget('HERMES.md'),
  },
  claude: {
    displayName: 'Claude',
    targets: projectTarget('CLAUDE.md'),
  },
  gemini: {
    displayName: 'Gemini',
    targets: projectTarget('GEMINI.md'),
  },
  qwencode: {
    displayName: 'Qwen Code',
    targets: projectTarget('QWEN.md'),
  },
  copilot: {
    displayName: 'GitHub Copilot',
    targets: projectTarget('.github/copilot-instructions.md'),
  },
  vscode: {
    displayName: 'VS Code',
    targets: projectTarget('.github/copilot-instructions.md'),
  },
  cursor: {
    displayName: 'Cursor',
    targets: projectTarget('.cursor/rules/CURSOR.md'),
  },
  cline: {
    displayName: 'Cline',
    targets: projectTarget('.cline/rules/CLINE.md'),
  },
  windsurf: {
    displayName: 'Windsurf',
    targets: projectTarget('.windsurf/rules/WINDSURF.md'),
  },
  roocode: {
    displayName: 'Roo Code',
    targets: projectTarget('.roo/rules/ROOCODE.md'),
  },
  kilocode: {
    displayName: 'Kilo Code',
    targets: projectTarget('.kilocode/rules/KILOCODE.md'),
  },
  antigravity: {
    displayName: 'Google Antigravity',
    targets: projectTarget('.agents/rules/ANTIGRAVITY.md'),
  },
  qoder: {
    displayName: 'Qoder',
    targets: projectTarget('AGENTS.md'),
  },
  kiro: {
    displayName: 'Kiro',
    targets: projectTarget('.kiro/steering/KIRO.md'),
  },
  pi: {
    displayName: 'Pi Agent',
    targets: projectTarget('AGENTS.md'),
  },
  'deepseek-harness': {
    displayName: 'DeepSeek Harness',
    targets: projectTarget('AGENTS.md'),
  },
  openclaw: {
    displayName: 'OpenClaw',
    targets: projectTarget('AGENTS.md'),
  },
  zcode: {
    displayName: 'ZCode',
    targets: projectTarget('AGENTS.md'),
  },
  trae: {
    displayName: 'Trae',
    targets: projectTarget('.trae/rules/TRAE.md'),
  },
  'trae-cn': {
    displayName: 'Trae-CN',
    targets: projectTarget('.trae-cn/rules/TRAE-CN.md'),
  },
  opencode: {
    displayName: 'OpenCode',
    targets: projectTarget('AGENTS.md'),
  },
};

export const SUPPORTED_PROJECT_IDS = Object.keys(PROJECT_AGENTS);
export function listProjectAgents() {
  return Object.keys(PROJECT_AGENTS).filter((id) => id !== 'all');
}

export function prRoot(projectRoot) {
  return join(resolve(projectRoot || process.cwd()), '.aek', 'prompt-manager', PR_ROOT_DIR);
}

export function prAgentsDir(projectRoot) {
  return join(prRoot(projectRoot), AGENTS_DIR);
}

export function prScriptsDir(projectRoot) {
  return join(prRoot(projectRoot), SCRIPTS_DIR);
}

export function prAllFile(projectRoot) {
  return join(prRoot(projectRoot), ALL_AGENT_FILE);
}

export function prAgentFile(projectRoot, agentId) {
  const agent = findProjectAgent(agentId);
  const base = prAgentsDir(projectRoot);
  // 源 md 文件名与目标文件名风格统一：agent id 大写
  return join(base, targetGroupDir(agent.targets.relPath), `${agentId.toUpperCase()}.md`);
}

export function prScriptFile(projectRoot, agentId) {
  return join(prScriptsDir(projectRoot), `${agentId}.mjs`);
}

export function findProjectAgent(id) {
  const agent = PROJECT_AGENTS[id];
  if (!agent) {
    throw new Error(`Unsupported project agent "${id}". Supported: ${SUPPORTED_PROJECT_IDS.join(', ')}`);
  }
  return agent;
}

export function projectAgentName(id) {
  return findProjectAgent(id).displayName;
}

export function projectAgentTargets(agentId, projectRoot) {
  return findProjectAgent(agentId).targets(projectRoot);
}

export async function readMaybe(filePath) {
  try {
    await access(filePath);
  } catch {
    return '';
  }
  return readFile(filePath, 'utf8');
}

async function writeIfMissing(filePath, content = '') {
  try {
    await access(filePath);
    return false;
  } catch {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    return true;
  }
}

// 与 agentId 共享同一目标文件（同一分组目录）的所有 agent id，按源文件名 A-Z 排序
export function groupAgents(agentId) {
  const agent = findProjectAgent(agentId);
  return listProjectAgents()
    .filter((id) => PROJECT_AGENTS[id].targets.relPath === agent.targets.relPath)
    .sort((a, b) => prAgentSourceName(a).localeCompare(prAgentSourceName(b)));
}

// 源 md 文件名（agent id 大写 + .md），排序与展示统一用它
function prAgentSourceName(agentId) {
  return `${agentId.toUpperCase()}.md`;
}

function scriptTemplate(agentId) {
  return `#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

execFileSync('aekpm', ['pr', 'gen', '${agentId}'], { stdio: 'inherit' });
`;
}

export async function initProjectRules(projectRoot) {
  const root = prRoot(projectRoot);
  await mkdir(root, { recursive: true });
  await mkdir(prAgentsDir(projectRoot), { recursive: true });
  await mkdir(prScriptsDir(projectRoot), { recursive: true });
  // 预建每个 agent 的分组目录（按其目标相对路径命名）
  for (const agentId of listProjectAgents()) {
    await mkdir(dirname(prAgentFile(projectRoot, agentId)), { recursive: true });
  }

  const files = [];
  async function addScript(agentId) {
    files.push({ path: prScriptFile(projectRoot, agentId), created: await writeIfMissing(prScriptFile(projectRoot, agentId), scriptTemplate(agentId)) });
  }

  files.push({ path: prAllFile(projectRoot), created: await writeIfMissing(prAllFile(projectRoot), '') });
  await addScript('all');
  for (const agentId of listProjectAgents()) {
    files.push({ path: prAgentFile(projectRoot, agentId), created: await writeIfMissing(prAgentFile(projectRoot, agentId), '') });
    await addScript(agentId);
  }
  return { root, files };
}

// 解析文件内容：拆出用户部分（aekpm 块之前/之后）与已存在的 agent 子块 map
function parseExisting(fileContent) {
  let headIdx = fileContent.indexOf(PR_HEAD);
  let endMark = PR_END;
  if (headIdx === -1) {
    headIdx = fileContent.indexOf(LEGACY_HEAD);
    endMark = LEGACY_END;
  }
  if (headIdx === -1) {
    return { found: false, before: fileContent.trimEnd(), after: '', subBlocks: new Map() };
  }
  let endIdx = fileContent.indexOf(endMark, headIdx);
  if (endIdx === -1) {
    throw new Error(`Malformed managed block: head marker found without matching end marker.`);
  }
  endIdx += endMark.length;
  const before = fileContent.slice(0, headIdx).trimEnd();
  const after = fileContent.slice(endIdx).trimStart();
  const inner = fileContent.slice(headIdx, endIdx);

  // 抽取子块 <!-- head-<id> --> ... <!-- end-<id> -->（负向断言排除外层标记自身，
  // 否则外层的 end 回引会把整个 inner 吞掉，子块就扫不到了）
  const subBlocks = new Map();
  const subRe = /<!-- head-(?!aek-prompt-manager -->)(?!aek-project-rules -->)([a-z0-9-]+) -->([\s\S]*?)<!-- end-\1 -->/gi;
  let m;
  while ((m = subRe.exec(inner)) !== null) {
    subBlocks.set(m[1], m[2].trim());
  }
  return { found: true, before, after, subBlocks };
}

function buildManagedBlock(allContent, subBlocks, orderedIds) {
  const lines = [PR_HEAD];
  if (allContent.trim()) lines.push(allContent.trimEnd(), '');
  const parts = [];
  for (const id of orderedIds) {
    const c = subBlocks.get(id);
    if (!c || !c.trim()) continue;
    parts.push(`${subBlockHead(id)}\n${c.trimEnd()}\n${subBlockEnd(id)}`);
  }
  if (parts.length) lines.push(parts.join('\n\n'), '');
  lines.push(PR_END);
  return lines.join('\n');
}

// gen 单个 agent：只更新自己的子块与外壳（含 all 内容），保留其他子块
// gen all：重写全部子块
export async function mergeProjectBlock(fileContent, agentId, projectRoot) {
  const existing = parseExisting(fileContent);
  const allContent = (await readMaybe(prAllFile(projectRoot))).trimEnd();

  const subBlocks = new Map(existing.subBlocks);
  let orderedIds;
  if (agentId === 'all') {
    // 全量：重写该目标所在组的全部 agent 子块
    // 目标维度由调用方保证（这里无法知道目标），交由 generateProjectRules 按组调用
    throw new Error('mergeProjectBlock 不支持 agentId=all，请走 generateProjectRules');
  }
  const ids = groupAgents(agentId);
  orderedIds = ids;
  const own = (await readMaybe(prAgentFile(projectRoot, agentId))).trimEnd();
  subBlocks.set(agentId, own);
  // 外壳 all 内容始终刷新；其他子块保留（parseExisting 已收集）

  const block = buildManagedBlock(allContent, subBlocks, orderedIds);
  const before = existing.before;
  const after = existing.after;
  const parts = [before, block, after].filter(Boolean);
  return { content: `${parts.join('\n\n')}\n`, replaced: existing.found };
}

async function writeOneTarget(target, agentId, projectRoot) {
  await mkdir(dirname(target), { recursive: true });
  let fileContent = '';
  try {
    fileContent = await readMaybe(target);
  } catch (error) {
    if (error?.code === 'EISDIR') {
      throw new Error(`Target path is a directory; expected a file: ${target}`);
    }
    throw error;
  }
  const { content: merged, replaced } = await mergeProjectBlock(fileContent, agentId, projectRoot);
  await writeFile(target, merged, 'utf8');
  return { target, replaced, content: merged };
}

// gen all：对每个唯一目标，按组重写全部子块
async function writeTargetFull(target, projectRoot) {
  await mkdir(dirname(target), { recursive: true });
  let fileContent = await readMaybe(target);
  const existing = parseExisting(fileContent);
  const allContent = (await readMaybe(prAllFile(projectRoot))).trimEnd();
  // 找出该目标对应的组（任一 agent 指向它即可）
  const groupIds = listProjectAgents().filter((id) =>
    PROJECT_AGENTS[id].targets(projectRoot).includes(target)
  ).sort((a, b) => prAgentSourceName(a).localeCompare(prAgentSourceName(b)));
  const subBlocks = new Map();
  for (const id of groupIds) {
    subBlocks.set(id, (await readMaybe(prAgentFile(projectRoot, id))).trimEnd());
  }
  const block = buildManagedBlock(allContent, subBlocks, groupIds);
  const parts = [existing.before, block, existing.after].filter(Boolean);
  const merged = `${parts.join('\n\n')}\n`;
  await writeFile(target, merged, 'utf8');
  return { target, replaced: existing.found, content: merged };
}

export async function generateProjectRules(agentId = 'all', projectRoot = process.cwd()) {
  const agent = findProjectAgent(agentId);
  const root = prRoot(projectRoot);
  const writes = [];
  let generated = 0;
  if (agentId === 'all') {
    const targetSet = new Set();
    for (const id of listProjectAgents()) {
      for (const t of PROJECT_AGENTS[id].targets(projectRoot)) targetSet.add(t);
    }
    for (const target of targetSet) {
      const r = await writeTargetFull(target, projectRoot);
      writes.push(r);
      if (r.content.trim()) generated += 1;
    }
  } else {
    for (const target of agent.targets(projectRoot)) {
      const r = await writeOneTarget(target, agentId, projectRoot);
      writes.push(r);
      if (r.content.trim()) generated += 1;
    }
  }
  return { agentId, generated, writes, root };
}
