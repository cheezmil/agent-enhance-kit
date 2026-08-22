// aek-prompt-manager — platforms
// Only platforms with a real global prompt file. Others are unsupported.

const os = process.platform;
const path = await import('node:path');

function homeDir() {
  return process.env.HOME || '';
}

function joinPath(base, ...parts) {
  return path.join(base, ...parts);
}

const isWindows = os === 'win32';

function globalPromptPath(id) {
  const home = homeDir();
  switch (id) {
    case 'claude-code':
      return joinPath(home, '.claude', 'CLAUDE.md');
    case 'opencode': {
      const cfg = process.env.XDG_CONFIG_HOME || joinPath(home, '.config');
      return joinPath(cfg, 'opencode', 'AGENTS.md');
    }
    case 'codex':
      return joinPath(home, '.codex', 'AGENTS.md');
    case 'hermes':
      return joinPath(home, '.hermes', 'SOUL.md');
    default:
      return '';
  }
}

function globalPromptLabel(id) {
  switch (id) {
    case 'claude-code': return 'global CLAUDE.md';
    case 'opencode': return 'global AGENTS.md';
    case 'codex': return 'global AGENTS.md';
    case 'hermes': return 'SOUL.md (global identity)';
    default: return '';
  }
}

// The full list of AgentTools from aek-mcp; only the four with real global
// prompt files are supported here. Everything else is reported as unsupported.
export const PLATFORMS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'codex',
    name: 'Codex',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    globalPromptPath,
    globalPromptLabel,
  },
];

export const SUPPORTED_IDS = PLATFORMS.map((p) => p.id);

const ALL_AGENT_IDS = [
  'claude-code', 'claude-desktop', 'cherry-studio', 'chatbox', 'cline',
  'codex', 'continue', 'cursor', 'hermes', 'opencode', 'vscode',
  'windsurf', 'workbuddy', 'openclaw', 'qoder', 'qwencode', 'antigravity',
  'kiro', 'kilocode', 'pi', 'deepseek-harness',
];

export const UNSUPPORTED = ALL_AGENT_IDS.filter((id) => !SUPPORTED_IDS.includes(id));

export const PATCH_FILENAME = 'patch.md';