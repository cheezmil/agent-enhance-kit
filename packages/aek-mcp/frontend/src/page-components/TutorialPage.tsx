'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, BookOpen, RefreshCw, ExternalLink, Search, X, Layers, Zap, Wrench } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useGroupData } from '@/hooks/useGroupData';
import { getApiUrl } from '@/utils/runtime';

interface TutorialConfig {
  username: string;
  key: string;
  mcpURL: string;
  host: string;
  port: string;
  basePath: string;
  group?: string;
}

interface AgentTool {
  id: string;
  name: string;
  description: string;
  /** Absolute path template keyed by OS — selected client-side. */
  configPath: { win: string; mac: string; linux: string };
  docUrl?: string;
  buildConfig: (cfg: TutorialConfig) => { inner: string; full: string };
}

interface ApplyResult {
  agentId: string;
  name: string;
  path: string;
  success: boolean;
  skipped: boolean;
  message?: string;
}

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
};

function mcpUrl(cfg: TutorialConfig): string {
  const base = cfg.mcpURL;
  if (cfg.group) {
    return base + '?group=' + cfg.group + '&key=' + cfg.key;
  }
  return base + '?key=' + cfg.key;
}

function buildInnerConfig(name: string, cfg: TutorialConfig, extra?: Record<string, unknown>): string {
  const obj: Record<string, unknown> = {
    type: 'streamable-http',
    url: mcpUrl(cfg),
    enabled: true,
    ...extra,
  };
  const inner = JSON.stringify(obj, null, 2);
  // Indent inner content by 2 spaces for nesting under the key
  const indented = inner
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');
  return `"${name}": ${indented}`;
}

function buildFullConfig(name: string, cfg: TutorialConfig, extra?: Record<string, unknown>): string {
  const obj: Record<string, unknown> = {
    type: 'streamable-http',
    url: mcpUrl(cfg),
    enabled: true,
    ...extra,
  };
  return JSON.stringify({ mcp: { [name]: obj } }, null, 2);
}

const AGENT_TOOLS: AgentTool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: '~/.claude.json / .mcp.json',
    configPath: { win: '%USERPROFILE%\\.claude.json', mac: '~/.claude.json', linux: '~/.claude.json' },
    docUrl: 'https://docs.anthropic.com/en/docs/claude-code/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: 'claude_desktop_config.json',
    configPath: { win: '%APPDATA%\\Claude\\claude_desktop_config.json', mac: '~/Library/Application Support/Claude/claude_desktop_config.json', linux: '~/.config/Claude/claude_desktop_config.json' },
    docUrl: 'https://docs.anthropic.com/en/docs/claude-desktop/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    description: 'Settings > MCP Servers (GUI)',
    configPath: { win: 'Settings > MCP Servers', mac: 'Settings > MCP Servers', linux: 'Settings > MCP Servers' },
    docUrl: 'https://docs.cherry-ai.com/docs/en-us/advanced-basic/mcp/config',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'chatbox',
    name: 'Chatbox',
    description: 'Settings > MCP > JSON 从剪贴板导入',
    configPath: { win: 'Settings > MCP', mac: 'Settings > MCP', linux: 'Settings > MCP' },
    docUrl: 'https://chatboxai.app/?c=guide&section=work-mode&article=configuration',
    buildConfig: (cfg) => {
      // Chatbox "JSON 从剪贴板导入" uses parseServersFromJson(),
      // which expects { mcpServers: { "<name>": { url, name? } } }.
      // Schema auto-detects transport from presence of `url` (→ http).
      // NO `transport` field.
      const chatboxJson = {
        mcpServers: {
          'aek_mcp': {
            url: mcpUrl(cfg),
          },
        },
      };
      return {
        inner: JSON.stringify(chatboxJson, null, 2),
        full: JSON.stringify(chatboxJson, null, 2),
      };
    },
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'cline_mcp_settings.json',
    configPath: { win: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json', mac: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json', linux: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
    docUrl: 'https://docs.cline.bot/mcp/mcp-overview',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'codex',
    name: 'Codex',
    description: '~/.codex/config.toml',
    configPath: { win: '%USERPROFILE%\\.codex\\config.toml', mac: '~/.codex/config.toml', linux: '~/.codex/config.toml' },
    docUrl: 'https://developers.openai.com/codex/mcp',
    buildConfig: (cfg) => ({
      inner: `[mcp_servers.aek_mcp]\nurl = "${mcpUrl(cfg)}"\nenabled = true`,
      full: `[mcp_servers.aek_mcp]\nurl = "${mcpUrl(cfg)}"\nenabled = true`,
    }),
  },
  {
    id: 'continue',
    name: 'Continue',
    description: '.continue/mcpServers/mcp.json',
    configPath: { win: '%USERPROFILE%\\.continue\\mcpServers\\mcp.json', mac: '~/.continue/mcpServers/mcp.json', linux: '~/.continue/mcpServers/mcp.json' },
    docUrl: 'https://docs.continue.dev/customize/deep-dives/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: '.cursor/mcp.json / ~/.cursor/mcp.json',
    configPath: { win: '%USERPROFILE%\\.cursor\\mcp.json', mac: '~/.cursor/mcp.json', linux: '~/.cursor/mcp.json' },
    docUrl: 'https://docs.cursor.com/context/model-context-protocol',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    description: 'hermes_config.yaml',
    configPath: { win: '%USERPROFILE%\\.hermes\\profiles\\default\\hermes_config.yaml', mac: '~/.hermes/profiles/default/hermes_config.yaml', linux: '~/.hermes/profiles/default/hermes_config.yaml' },
    buildConfig: (cfg) => ({
      inner: `aek__mcp:\n  type: streamable-http\n  url: "${mcpUrl(cfg)}"\n  enabled: true`,
      full: `mcp:\n  aek__mcp:\n    type: streamable-http\n    url: "${mcpUrl(cfg)}"\n    enabled: true`,
    }),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'opencode.json',
    configPath: { win: '%USERPROFILE%\\.config\\opencode\\opencode.json', mac: '~/.config/opencode/opencode.json', linux: '~/.config/opencode/opencode.json' },
    docUrl: 'https://opencode.ai/docs/config',
    buildConfig: (cfg) => {
      // OpenCode only supports type "local" (spawn a process) or "remote" (HTTP).
      // There is no "streamable-http" type — remote servers use type "remote".
      const obj = {
        type: 'remote',
        url: mcpUrl(cfg),
        enabled: true,
        timeout: 6600000,
      };
      const inner = JSON.stringify(obj, null, 2);
      const indented = inner
        .split('\n')
        .map((line, i) => (i === 0 ? line : '  ' + line))
        .join('\n');
      return {
        inner: `"aek_mcp": ${indented}`,
        full: JSON.stringify({ mcp: { 'aek_mcp': obj } }, null, 2),
      };
    },
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    description: '.vscode/mcp.json / user profile',
    configPath: { win: '<project>\\.vscode\\mcp.json', mac: '<project>/.vscode/mcp.json', linux: '<project>/.vscode/mcp.json' },
    docUrl: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
    buildConfig: (cfg) => ({
      inner: `"aek_mcp":\n  type: "http"\n  url: "${mcpUrl(cfg)}"`,
      full: `{\n  "servers": {\n    "aek_mcp": {\n      "type": "http",\n      "url": "${mcpUrl(cfg)}"\n    }\n  }\n}`,
    }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: '~/.codeium/windsurf/mcp_config.json',
    configPath: { win: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json', mac: '~/.codeium/windsurf/mcp_config.json', linux: '~/.codeium/windsurf/mcp_config.json' },
    docUrl: 'https://docs.windsurf.com/plugins/cascade/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek_mcp', cfg),
      full: buildFullConfig('aek_mcp', cfg),
    }),
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    description: '~/.codebuddy/.mcp.json',
    configPath: { win: '%USERPROFILE%\\.codebuddy\\.mcp.json', mac: '~/.codebuddy/.mcp.json', linux: '~/.codebuddy/.mcp.json' },
    docUrl: 'https://www.workbuddy.ai/docs/cli/mcp',
    buildConfig: (cfg) => {
      const obj = { type: 'http', url: mcpUrl(cfg) };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: '~/.openclaw/openclaw.json',
    configPath: { win: '%USERPROFILE%\\.openclaw\\openclaw.json', mac: '~/.openclaw/openclaw.json', linux: '~/.openclaw/openclaw.json' },
    docUrl: 'https://docs.openclaw.ai/cli/mcp',
    buildConfig: (cfg) => {
      const obj = { url: mcpUrl(cfg), transport: 'streamable-http', enabled: true };
      const full = { mcp: { servers: { aek_mcp: obj } } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'qoder',
    name: 'Qoder',
    description: '~/.qoder/settings.json',
    configPath: { win: '%USERPROFILE%\\.qoder\\settings.json', mac: '~/.qoder/settings.json', linux: '~/.qoder/settings.json' },
    docUrl: 'https://docs.qoder.com/cli/mcp-servers',
    buildConfig: (cfg) => {
      const obj = { type: 'http', url: mcpUrl(cfg) };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'qwencode',
    name: 'QWencode',
    description: '~/.qwen/settings.json',
    configPath: { win: '%USERPROFILE%\\.qwen\\settings.json', mac: '~/.qwen/settings.json', linux: '~/.qwen/settings.json' },
    docUrl: 'https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/',
    buildConfig: (cfg) => {
      const obj = { httpUrl: mcpUrl(cfg), timeout: 60000 };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    description: '~/.gemini/config/mcp_config.json',
    configPath: { win: '%USERPROFILE%\\.gemini\\config\\mcp_config.json', mac: '~/.gemini/config/mcp_config.json', linux: '~/.gemini/config/mcp_config.json' },
    docUrl: 'https://antigravity.google/docs/cli/mcp/',
    buildConfig: (cfg) => {
      const obj = { serverUrl: mcpUrl(cfg) };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'kiro',
    name: 'Kiro',
    description: '~/.kiro/settings/mcp.json',
    configPath: { win: '%USERPROFILE%\\.kiro\\settings\\mcp.json', mac: '~/.kiro/settings/mcp.json', linux: '~/.kiro/settings/mcp.json' },
    docUrl: 'https://kiro.dev/docs/cli/mcp/',
    buildConfig: (cfg) => {
      const obj = { url: mcpUrl(cfg), disabled: false };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'kilocode',
    name: 'Kilo Code',
    description: '~/.config/kilo/kilo.jsonc',
    configPath: { win: '%USERPROFILE%\\.config\\kilo\\kilo.jsonc', mac: '~/.config/kilo/kilo.jsonc', linux: '~/.config/kilo/kilo.jsonc' },
    docUrl: 'https://kilo.ai/docs/automate/mcp/using-in-kilo-code',
    buildConfig: (cfg) => {
      // Kilo Code uses top-level "mcp" key (not "mcpServers")
      const obj = { type: 'remote', url: mcpUrl(cfg), enabled: true };
      const full = { mcp: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
  {
    id: 'pi',
    name: 'Pi Agent',
    description: '~/.pi/agent/mcp.json',
    configPath: { win: '%USERPROFILE%\\.pi\\agent\\mcp.json', mac: '~/.pi/agent/mcp.json', linux: '~/.pi/agent/mcp.json' },
    docUrl: 'https://pi.dev/docs',
    buildConfig: (cfg) => {
      const obj = { transport: 'streamable-http', url: mcpUrl(cfg), lifecycle: 'eager' };
      const full = { mcpServers: { aek_mcp: obj } };
      return {
        inner: JSON.stringify(obj, null, 2),
        full: JSON.stringify(full, null, 2),
      };
    },
  },
];

// Tools whose config is accessed through a GUI dialog rather than an editable file.
const GUI_ONLY_IDS = new Set(['cherry-studio', 'chatbox', 'cline']);

const CopyPathButton: React.FC<{ path: string; showToast: (msg: string, type: 'success' | 'error') => void }> = ({ path, showToast }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copyToClipboard(path);
    if (!ok) {
      showToast('Copy failed', 'error');
      return;
    }
    setCopied(true);
    showToast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className="p-1 rounded hover:bg-[var(--hub-surface-hover)] transition-colors"
      title="Copy path"
    >
      {copied ? <Check size={12} className="text-[var(--hub-ok)]" /> : <Copy size={12} />}
    </button>
  );
};

const CopyButton: React.FC<{ text: string; label: string; showToast: (msg: string, type: 'success' | 'error') => void }> = ({
  text,
  label,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) {
      showToast('Copy failed', 'error');
      return;
    }
    setCopied(true);
    showToast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors
        bg-[var(--hub-surface)] hover:bg-[var(--hub-surface-hover)] text-[var(--hub-ink-2)] hover:text-[var(--hub-ink)]
        border border-[var(--hub-line)]"
      title={label}
    >
      {copied ? <Check size={12} className="text-[var(--hub-ok)]" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
};

const TutorialPage: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { groups } = useGroupData();
  const [config, setConfig] = useState<TutorialConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('default');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  const savePrefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Detect platform and pick the matching absolute path string. */
  const platformPath = useMemo(() => {
    const plat = ((navigator as unknown) as { userAgentData?: { platform: string } })?.userAgentData?.platform ?? navigator.platform ?? '';
    if (/win/i.test(plat)) return 'win';
    if (/mac/i.test(plat)) return 'mac';
    return 'linux';
  }, []);

  const filteredTools = AGENT_TOOLS.filter(
    (tool) => {
      const pathStr = `${tool.configPath.win} ${tool.configPath.mac} ${tool.configPath.linux}`.toLowerCase();
      return tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pathStr.includes(searchQuery.toLowerCase());
    },
  );

  // When groups load, ensure selectedGroup is valid; default to first group (by name).
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.name === selectedGroup)) {
      setSelectedGroup(groups[0].name);
    }
  }, [groups, selectedGroup]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(`/tutorial/config?group=${encodeURIComponent(selectedGroup)}`), {
        headers: { Authorization: `Bearer ${localStorage.getItem('aek_mcp_token') || ''}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        const cfg = { ...data.data, group: selectedGroup };
        setConfig(cfg);
      } else {
        setError(data.message || 'Failed to load config');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup]);

  // Load saved prefs from backend on mount
  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/tutorial/prefs'), {
        headers: { Authorization: `Bearer ${localStorage.getItem('aek_mcp_token') || ''}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedAgents(data.data.selectedAgents || []);
      }
    } catch { /* ignore */ }
    setPrefsLoaded(true);
  }, []);

  // Save prefs to backend with debounce
  const savePrefs = useCallback((agents: string[]) => {
    if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
    savePrefsTimer.current = setTimeout(async () => {
      try {
        await fetch(getApiUrl('/tutorial/prefs'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aek_mcp_token') || ''}` },
          body: JSON.stringify({ selectedAgents: agents }),
        });
      } catch { /* ignore */ }
    }, 300);
  }, []);

  // Apply config to selected agents
  const applyToAgents = useCallback(async () => {
    if (selectedAgents.length === 0 || !config) return;
    setApplying(true);
    setApplyResults(null);
    try {
      const res = await fetch(getApiUrl('/tutorial/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aek_mcp_token') || ''}` },
        body: JSON.stringify({ agents: selectedAgents, group: selectedGroup }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setApplyResults(data.data as ApplyResult[]);
        const allOk = data.data.every((r: ApplyResult) => r.success || r.skipped);
        if (allOk) {
          showToast(t('tutorial.applySuccess', 'Config applied'), 'success');
        } else {
          showToast(t('tutorial.applyPartial', 'Some tools failed'), 'warning');
        }
      } else {
        showToast(t('tutorial.applyFailed', 'Config failed'), 'error');
      }
    } catch {
      showToast(t('tutorial.applyFailed', 'Config failed'), 'error');
    } finally {
      setApplying(false);
    }
  }, [selectedAgents, selectedGroup, config, showToast, t]);

  // Handle checkbox change
  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) => {
      const next = prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId];
      savePrefs(next);
      return next;
    });
  }, [savePrefs]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="hub-h1 flex items-center gap-2">
            <BookOpen size={20} className="text-[var(--hub-ink-2)]" />
            {t('tutorial.title', 'Tutorial')}
          </h1>
          <p className="hub-sub mt-1">
            {t('tutorial.description', 'How to configure AEK-MCP in your favorite AI coding tools')}
          </p>
        </div>
        <button
          onClick={fetchConfig}
          disabled={loading}
          className="hub-icon-btn"
          title={t('common.refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Group selector */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <label className="block text-[12px] font-medium text-[var(--hub-ink-2)]">
            <Layers size={14} className="inline mr-1 vertical-align-middle" />
            {t('tutorial.group', 'Group')}
          </label>
        </div>
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="w-full px-3 py-2 text-[14px] rounded-lg border border-[var(--hub-line)]
            bg-[var(--hub-surface)] text-[var(--hub-ink)]
            focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
        >
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {/* Search bar */}
      {!loading && !error && config && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-ink-3)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('tutorial.search', 'Search tools...')}
            className="w-full pl-10 pr-8 py-2 text-[14px] rounded-lg border border-[var(--hub-line)]
              bg-[var(--hub-surface)] text-[var(--hub-ink)] placeholder:text-[var(--hub-ink-3)]
              focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--hub-ink-3)] hover:text-[var(--hub-ink)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="hub-card p-8 text-center text-[var(--hub-ink-3)]">
          {t('app.loading')}
        </div>
      )}

      {error && (
        <div className="hub-card p-8 text-center text-red-500">
          {error}
        </div>
      )}

      {config && !loading && (
        <>
          {/* One-click install section */}
          {prefsLoaded && (
            <div className="hub-card mb-6">
              <div className="px-5 py-4 border-b border-[var(--hub-line)]">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-[var(--hub-accent)]" />
                  <span className="font-medium text-[14px] text-[var(--hub-ink)]">
                    {t('tutorial.oneClickTitle', 'One-click Config')}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--hub-ink-3)]">
                  {t('tutorial.oneClickDescription', 'Select the AI tools, then click apply to write the AEK-MCP entry directly into each tool\'s config file. Your selection is remembered automatically.')}
                </p>
              </div>
              <div className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {AGENT_TOOLS.map((tool) => {
                    const checked = selectedAgents.includes(tool.id);
                    return (
                      <label
                        key={tool.id}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[13px] cursor-pointer select-none transition-colors ${
                          checked
                            ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10 text-[var(--hub-ink)]'
                            : 'border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink-2)] hover:border-[var(--hub-line-strong)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--hub-accent)]"
                          checked={checked}
                          onChange={() => toggleAgent(tool.id)}
                        />
                        {tool.name}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedAgents(AGENT_TOOLS.map((t) => t.id));
                      savePrefs(AGENT_TOOLS.map((t) => t.id));
                    }}
                    className="px-2.5 py-1 text-[12px] rounded-md border border-[var(--hub-line)] hover:bg-[var(--hub-surface-hover)] text-[var(--hub-ink-2)]"
                  >
                    {t('tutorial.selectAll', 'Select All')}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAgents([]);
                      savePrefs([]);
                    }}
                    className="px-2.5 py-1 text-[12px] rounded-md border border-[var(--hub-line)] hover:bg-[var(--hub-surface-hover)] text-[var(--hub-ink-2)]"
                  >
                    {t('tutorial.clearAll', 'Clear')}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={applyToAgents}
                    disabled={applying || selectedAgents.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-lg text-white bg-[var(--hub-accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    <Wrench size={13} />
                    {applying
                      ? t('tutorial.applying', 'Applying...')
                      : t('tutorial.applySelected', 'Apply to selected ({{count}})', { count: selectedAgents.length })}
                  </button>
                </div>
                {applyResults && (
                  <div className="mt-3 border-t border-[var(--hub-line)] pt-3">
                    <div className="flex flex-wrap gap-2">
                      {applyResults.map((r) => (
                        <div
                          key={r.agentId}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-md border ${
                            r.skipped
                              ? 'border-[var(--hub-line)] text-[var(--hub-ink-3)]'
                              : r.success
                                ? 'border-emerald-600/30 text-emerald-600'
                                : 'border-red-500/30 text-red-500'
                          }`}
                          title={r.message || r.path}
                        >
                          {r.skipped
                            ? '⏭'
                            : r.success
                              ? '✓'
                              : '✗'}
                          <span>{r.name}</span>
                          <span className="font-mono text-[11px] opacity-70">
                            {r.skipped
                              ? t('tutorial.resultSkipped', 'Skipped')
                              : r.success
                                ? t('tutorial.resultSuccess', 'OK')
                                : t('tutorial.resultError', 'Failed')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--hub-ink-3)]">
                      {t('tutorial.restartHint', 'Restart the tool after applying so it reloads the MCP entry.')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filteredTools.length === 0 && (
              <div className="hub-card p-8 text-center text-[var(--hub-ink-3)]">
                {t('tutorial.noResults', 'No tools match your search')}
              </div>
            )}
            {filteredTools.map((tool) => {
                const { inner, full } = tool.buildConfig(config);

              return (
                <div key={tool.id} className="hub-card overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[14px] text-[var(--hub-ink)]">{tool.name}</div>
                      <div className="flex items-center gap-1 text-[12px] text-[var(--hub-ink-3)] font-mono">
                        <span>{tool.configPath[platformPath]}</span>
                        {!GUI_ONLY_IDS.has(tool.id) && (
                          <CopyPathButton path={tool.configPath[platformPath]} showToast={showToast} />
                        )}
                      </div>
                    </div>
                    {tool.docUrl && (
                      <a
                        href={tool.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-[var(--hub-surface-hover)] transition-colors text-[var(--hub-ink-3)] hover:text-[var(--hub-ink)]"
                        title={t('tutorial.docs', 'Documentation')}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>

                  <div className="px-5 pb-5 space-y-4 border-t border-[var(--hub-line)]">
                    {/* Full config — hidden for chatbox which only needs Inner */}
                    {tool.id !== 'chatbox' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-medium text-[var(--hub-ink-2)]">
                            {t('tutorial.fullConfig', 'Example of complete fields on this platform')}
                          </span>
                        </div>
                        <pre className="p-3 bg-gray-900 text-gray-100 rounded text-[12px] font-mono overflow-x-auto whitespace-pre select-none">
                          {full}
                        </pre>
                      </div>
                    )}

                    {/* Inner config */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-medium text-[var(--hub-ink-2)]">
                          {t('tutorial.innerConfig', 'Inner Config')}
                        </span>
                        <CopyButton text={inner} label={t('tutorial.copyInner', 'Copy inner')} showToast={showToast} />
                      </div>
                      <pre className="p-3 bg-gray-900 text-gray-100 rounded text-[12px] font-mono overflow-x-auto whitespace-pre">
                        {inner}
                      </pre>
                    </div>

                    {/* Chatbox-specific instructions */}
                    {tool.id === 'chatbox' && (
                      <div className="text-[12px] text-[var(--hub-ink-2)]">
                        {t('tutorial.chatboxPaste', '在 Chatbox 中点击「从剪贴板中的 JSON 导入」即可导入。')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TutorialPage;
