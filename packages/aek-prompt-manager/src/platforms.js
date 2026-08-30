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

function globalPromptPath(id, options = {}) {
  const home = options.home ?? homeDir();
  const win = options.os === 'win32';
  // 分隔符选择：仅当目标 home 是 Windows 原生驱动符路径(C:\...)才用 win32 分隔符；
  // WSL 双写 /mnt/c/Users/... 或测试用的 /tmp 等正斜杠路径，必须保持 posix 以便 node fs 直接写入。
  const useWin32 = win && /^[A-Za-z]:[\\/]/.test(home);
  const pathModule = useWin32 ? path.win32 : path;
  const joinPath = (base, ...parts) => pathModule.join(base, ...parts);
  switch (id) {
    case 'claude-code':
      return joinPath(home, '.claude', 'CLAUDE.md');
    case 'claude-desktop':
      return joinPath(home, '.claude', 'CLAUDE.md');
    case 'cline':
      return joinPath(home, '.agents', 'AGENTS.md');
    case 'cursor':
      return joinPath(home, '.cursor', 'rules', 'aek-pm.mdc');
    case 'vscode':
      return joinPath(home, '.copilot', 'instructions', 'aek-pm.instructions.md');
    case 'windsurf':
      return joinPath(home, '.codeium', 'windsurf', 'memories', 'global_rules.md');
    case 'openclaw':
      return joinPath(home, '.openclaw', 'AGENTS.md');
    case 'qoder':
      return joinPath(home, '.qoder', 'AGENTS.md');
    case 'qwencode':
      return joinPath(home, '.qwen', 'AGENTS.md');
    case 'antigravity':
      return joinPath(home, '.gemini', 'AGENTS.md');
    case 'kiro':
      return joinPath(home, '.kiro', 'steering', 'AGENTS.md');
    case 'kilocode':
      return joinPath(home, '.config', 'kilo', 'AGENTS.md');
    case 'pi':
      return joinPath(home, '.pi', 'agent', 'AGENTS.md');
    case 'deepseek-harness':
      return joinPath(home, '.dsh', 'AGENTS.md');
    case 'opencode': {
      const cfg = win
        ? (process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA.replace(/\\/g, '/') : joinPath(home, 'AppData', 'Local'))
        : (process.env.XDG_CONFIG_HOME || joinPath(home, '.config'));
      return joinPath(cfg, 'opencode', 'AGENTS.md');
    }
    case 'codex':
      return joinPath(home, '.codex', 'AGENTS.md');
    case 'hermes':
      // Hermes 配置目录在 %USERPROFILE%\.hermes\（skills/config/SOUL.md 均在此），
      // 与 Linux/macOS 的 ~/.hermes 布局一致，并不用 LOCALAPPDATA。
      return joinPath(home, '.hermes', 'SOUL.md');
    default:
      return '';
  }
}

// Hermes 在 Windows 原生除 %USERPROFILE%\.hermes\ 外，历史安装也可能落在
// %USERPROFILE%\AppData\Local\hermes\。这里返回主路径之外的额外候选，部署时一并写入。
function hermesWinAltTargets(winRoot) {
  return [joinPath(winRoot, 'AppData', 'Local', 'hermes', 'SOUL.md')];
}

function globalPromptLabel(id) {
  switch (id) {
    case 'claude-code': return 'global CLAUDE.md';
    case 'claude-desktop': return 'global CLAUDE.md (shared with Claude Code)';
    case 'cline': return '~/.agents/AGENTS.md (cross-tool global AGENTS)';
    case 'cursor': return '~/.cursor/rules/aek-pm.mdc';
    case 'vscode': return '~/.copilot/instructions/aek-pm.instructions.md';
    case 'windsurf': return 'global_rules.md (Windsurf global rules)';
    case 'openclaw': return 'workspace AGENTS.md';
    case 'qoder': return '~/.qoder/AGENTS.md (user-level)';
    case 'qwencode': return '~/.qwen/AGENTS.md';
    case 'antigravity': return '~/.gemini/AGENTS.md (cross-tool)';
    case 'kiro': return '~/.kiro/steering/AGENTS.md';
    case 'kilocode': return '~/.config/kilo/AGENTS.md';
    case 'pi': return '~/.pi/agent/AGENTS.md';
    case 'deepseek-harness': return '~/.dsh/AGENTS.md (user-global)';
    case 'opencode': return 'global AGENTS.md';
    case 'codex': return 'global AGENTS.md';
    case 'hermes': return 'SOUL.md (global identity)';
    default: return '';
  }
}

// The full list of AgentTools from aek-mcp. Every tool with a real global
// prompt file is supported here; the rest (GUI-only apps like Cherry Studio /
// Chatbox, or tools whose global rules live in a UI or config field like
// Continue / WorkBuddy) are reported as unsupported.
export const PLATFORMS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'cline',
    name: 'Cline',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    globalPromptPath,
    globalPromptLabel,
    fileHeader: '---\ndescription: aek-prompt-manager managed rules\nglobs: **\nalwaysApply: true\n---\n\n',
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    globalPromptPath,
    globalPromptLabel,
    fileHeader: '---\napplyTo: \"**\"\n---\n\n',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'qoder',
    name: 'Qoder',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'qwencode',
    name: 'QWencode',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'kiro',
    name: 'Kiro',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    globalPromptPath,
    globalPromptLabel,
  },
  {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
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
    // Hermes 在 Windows 原生可能有多个配置位置，全部写入以确保生效。
    winAltTargets: hermesWinAltTargets,
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