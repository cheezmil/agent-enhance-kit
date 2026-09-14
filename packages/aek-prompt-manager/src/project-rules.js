// aek-prompt-manager — project rules generation
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

export const PR_ROOT_DIR = 'project-rules';
export const AGENTS_DIR = 'for-certain-agents';
export const SCRIPTS_DIR = 'scripts';
export const ALL_AGENT_FILE = 'all-agent-must-comply.md';
export const PR_HEAD = '<!-- head-aek-project-rules -->';
export const PR_END = '<!-- end-aek-project-rules -->';

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

function buildBlock(content) {
  return `${PR_HEAD}\n${content.trimEnd()}\n${PR_END}`;
}

function findBlockEnd(text, start) {
  const idx = text.indexOf(PR_END, start);
  return idx === -1 ? -1 : idx + PR_END.length;
}

export function mergeProjectBlock(fileContent, content) {
  const block = buildBlock(content);
  const headIdx = fileContent.indexOf(PR_HEAD);
  if (headIdx === -1) {
    const prefix = fileContent.trimEnd();
    return { content: prefix ? `${prefix}\n\n${block}\n` : `${block}\n`, replaced: false };
  }
  const endIdx = findBlockEnd(fileContent, headIdx);
  if (endIdx === -1) {
    throw new Error(`Malformed managed block: ${PR_HEAD} found without matching ${PR_END}.`);
  }
  const before = fileContent.slice(0, headIdx).trimEnd();
  const after = fileContent.slice(endIdx).trimStart();
  const parts = [before, block, after].filter(Boolean);
  return { content: `${parts.join('\n\n')}\n`, replaced: true };
}

async function buildContentForAgent(agentId, projectRoot) {
  const parts = [];
  const allContent = await readMaybe(prAllFile(projectRoot));
  if (allContent.trim()) parts.push(allContent.trimEnd());
  if (agentId && agentId !== 'all') {
    const agent = findProjectAgent(agentId);
    const agentContent = await readMaybe(prAgentFile(projectRoot, agentId));
    if (agentContent.trim()) parts.push(agentContent.trimEnd());
  }
  return parts.join('\n\n');
}

async function writeOneTarget(target, content) {
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
  const { content: merged, replaced } = mergeProjectBlock(fileContent, content);
  await writeFile(target, merged, 'utf8');
  return { target, replaced, content: merged };
}

export async function generateProjectRules(agentId = 'all', projectRoot = process.cwd()) {
  const agent = findProjectAgent(agentId);
  const root = prRoot(projectRoot);
  let targetList;
  if (agentId === 'all') {
    targetList = [];
    for (const id of listProjectAgents()) {
      targetList.push(...PROJECT_AGENTS[id].targets(projectRoot));
    }
    targetList = [...new Set(targetList)];
  } else {
    targetList = agent.targets(projectRoot);
  }
  const content = await buildContentForAgent(agentId, projectRoot);
  const writes = [];
  let generated = 0;
  for (const target of targetList) {
    if (target === '__all_targets__') continue;
    const r = await writeOneTarget(target, content);
    writes.push(r);
    if (content.trim()) generated += 1;
  }
  return { agentId, generated, writes, root };
}
