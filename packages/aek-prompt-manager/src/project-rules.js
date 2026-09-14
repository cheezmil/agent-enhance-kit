// aek-prompt-manager — project rules generation
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PR_ROOT_DIR = 'project-rules';
export const AGENTS_DIR = 'agents';
export const SCRIPTS_DIR = 'scripts';
export const ALL_AGENT_FILE = 'all-agent-must-comply.md';
export const PR_HEAD = '<!-- head-aek-pr-rules -->';
export const PR_END = '<!-- end-aek-pr-rules -->';

export const PROJECT_AGENTS = {
  all: {
    displayName: 'all',
    sourceFile: null,
    targets: (projectRoot) => [
      join(projectRoot, 'AGENTS.md'),
      join(projectRoot, 'CLAUDE.md'),
      join(projectRoot, 'GEMINI.md'),
      join(projectRoot, 'QWEN.md'),
      join(projectRoot, '.roo', 'rules-code', 'rules.md'),
      join(projectRoot, '.roo', 'rules-architect', 'rules.md'),
      join(projectRoot, '.roo', 'rules-ask', 'rules.md'),
      join(projectRoot, '.roo', 'rules-debug', 'rules.md'),
      join(projectRoot, '.roo', 'rules-orchestrator', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-code', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-architect', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-ask', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-debug', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-orchestrator', 'rules.md'),
    ],
  },
  codex: {
    displayName: 'Codex',
    sourceFile: 'codex.md',
    targets: (projectRoot) => [join(projectRoot, 'AGENTS.md')],
  },
  claude: {
    displayName: 'Claude',
    sourceFile: 'claude.md',
    targets: (projectRoot) => [join(projectRoot, 'CLAUDE.md')],
  },
  gemini: {
    displayName: 'Gemini',
    sourceFile: 'gemini.md',
    targets: (projectRoot) => [join(projectRoot, 'GEMINI.md')],
  },
  qwencode: {
    displayName: 'Qwen Code',
    sourceFile: 'qwencode.md',
    targets: (projectRoot) => [join(projectRoot, 'QWEN.md')],
  },
  roocode: {
    displayName: 'Roo Code',
    sourceFile: 'roocode.md',
    targets: (projectRoot) => [
      join(projectRoot, '.roo', 'rules-code', 'rules.md'),
      join(projectRoot, '.roo', 'rules-architect', 'rules.md'),
      join(projectRoot, '.roo', 'rules-ask', 'rules.md'),
      join(projectRoot, '.roo', 'rules-debug', 'rules.md'),
      join(projectRoot, '.roo', 'rules-orchestrator', 'rules.md'),
    ],
  },
  kilocode: {
    displayName: 'Kilo Code',
    sourceFile: 'kilocode.md',
    targets: (projectRoot) => [
      join(projectRoot, '.kilocode', 'rules-code', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-architect', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-ask', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-debug', 'rules.md'),
      join(projectRoot, '.kilocode', 'rules-orchestrator', 'rules.md'),
    ],
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
  return join(prAgentsDir(projectRoot), `${agentId}.md`);
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

export async function readMaybe(filePath) {
  try {
    await access(filePath);
  } catch {
    return '';
  }
  return readFile(filePath, 'utf8');
}

async function copyMissing(templatePath, targetPath) {
  try {
    await access(targetPath);
    return false;
  } catch {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(templatePath, 'utf8'), 'utf8');
    return true;
  }
}

function projectTemplatesDir() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'project-rules');
}

function resolveProjectRuleScriptTemplate(agentId) {
  const templatePath = join(projectTemplatesDir(), SCRIPTS_DIR, `${agentId}.mjs`);
  if (!templatePath.startsWith(projectTemplatesDir())) {
    throw new Error(`Invalid project-rule script template: ${agentId}`);
  }
  return templatePath;
}

export async function initProjectRules(projectRoot) {
  const root = prRoot(projectRoot);
  await mkdir(root, { recursive: true });
  await mkdir(prAgentsDir(projectRoot), { recursive: true });
  await mkdir(prScriptsDir(projectRoot), { recursive: true });

  const files = [];
  async function addTemplate(templatePath, targetPath) {
    files.push({ path: targetPath, created: await copyMissing(templatePath, targetPath) });
  }

  await addTemplate(join(projectTemplatesDir(), ALL_AGENT_FILE), prAllFile(projectRoot));
  await addTemplate(resolveProjectRuleScriptTemplate('all'), prScriptFile(projectRoot, 'all'));
  for (const agentId of listProjectAgents()) {
    await addTemplate(join(projectTemplatesDir(), AGENTS_DIR, `${agentId}.md`), prAgentFile(projectRoot, agentId));
    await addTemplate(resolveProjectRuleScriptTemplate(agentId), prScriptFile(projectRoot, agentId));
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
  const fileContent = await readMaybe(target);
  const { content: merged, replaced } = mergeProjectBlock(fileContent, content);
  await writeFile(target, merged, 'utf8');
  return { target, replaced };
}

export async function generateProjectRules(agentId = 'all', projectRoot = process.cwd()) {
  findProjectAgent(agentId);
  const content = await buildContentForAgent(agentId, projectRoot);
  const targets = PROJECT_AGENTS[agentId].targets(projectRoot);
  const writes = [];
  let generated = 0;
  for (const target of targets) {
    const targetContent = await buildContentForAgent(agentId, projectRoot);
    const r = await writeOneTarget(target, targetContent);
    writes.push(r);
    if (content.trim()) generated += 1;
  }
  return { agentId, generated, writes, root: prRoot(projectRoot) };
}
