'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, BookOpen, RefreshCw, ExternalLink, Search, X, Layers } from 'lucide-react';
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
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: 'claude_desktop_config.json',
    configPath: { win: '%APPDATA%\\Claude\\claude_desktop_config.json', mac: '~/Library/Application Support/Claude/claude_desktop_config.json', linux: '~/.config/Claude/claude_desktop_config.json' },
    docUrl: 'https://docs.anthropic.com/en/docs/claude-desktop/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    description: 'Settings > MCP Servers (GUI)',
    configPath: { win: 'Settings > MCP Servers', mac: 'Settings > MCP Servers', linux: 'Settings > MCP Servers' },
    docUrl: 'https://docs.cherry-ai.com/docs/en-us/advanced-basic/mcp/config',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'cline_mcp_settings.json',
    configPath: { win: '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json', mac: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json', linux: '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json' },
    docUrl: 'https://docs.cline.bot/mcp/mcp-overview',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'continue',
    name: 'Continue',
    description: '.continue/mcpServers/mcp.json',
    configPath: { win: '%USERPROFILE%\\.continue\\mcpServers\\mcp.json', mac: '~/.continue/mcpServers/mcp.json', linux: '~/.continue/mcpServers/mcp.json' },
    docUrl: 'https://docs.continue.dev/customize/deep-dives/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: '.cursor/mcp.json / ~/.cursor/mcp.json',
    configPath: { win: '%USERPROFILE%\\.cursor\\mcp.json', mac: '~/.cursor/mcp.json', linux: '~/.cursor/mcp.json' },
    docUrl: 'https://docs.cursor.com/context/model-context-protocol',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    description: 'hermes_config.yaml',
    configPath: { win: '%USERPROFILE%\\.hermes\\profiles\\default\\hermes_config.yaml', mac: '~/.hermes/profiles/default/hermes_config.yaml', linux: '~/.hermes/profiles/default/hermes_config.yaml' },
    buildConfig: (cfg) => ({
      inner: `aek-mcp:\n  type: streamable-http\n  url: "${mcpUrl(cfg)}"\n  enabled: true`,
      full: `mcp:\n  aek-mcp:\n    type: streamable-http\n    url: "${mcpUrl(cfg)}"\n    enabled: true`,
    }),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'opencode.json',
    configPath: { win: '%USERPROFILE%\\.config\\opencode\\opencode.json', mac: '~/.config/opencode/opencode.json', linux: '~/.config/opencode/opencode.json' },
    docUrl: 'https://opencode.ai/docs/config',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg, { timeout: 6600000 }),
      full: buildFullConfig('aek-mcp', cfg, { timeout: 6600000 }),
    }),
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    description: '.vscode/mcp.json / user profile',
    configPath: { win: '<project>\\.vscode\\mcp.json', mac: '<project>/.vscode/mcp.json', linux: '<project>/.vscode/mcp.json' },
    docUrl: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
    buildConfig: (cfg) => ({
      inner: `"aek-mcp":\n  type: "http"\n  url: "${mcpUrl(cfg)}"`,
      full: `{\n  "servers": {\n    "aek-mcp": {\n      "type": "http",\n      "url": "${mcpUrl(cfg)}"\n    }\n  }\n}`,
    }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: '~/.codeium/windsurf/mcp_config.json',
    configPath: { win: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json', mac: '~/.codeium/windsurf/mcp_config.json', linux: '~/.codeium/windsurf/mcp_config.json' },
    docUrl: 'https://docs.windsurf.com/plugins/cascade/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
];

// Tools whose config is accessed through a GUI dialog rather than an editable file.
const GUI_ONLY_IDS = new Set(['cherry-studio', 'cline']);

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

  // When groups load, ensure selectedGroup is valid; default to first group.
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.id === selectedGroup)) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl(`/tutorial/config?group=${encodeURIComponent(selectedGroup)}`), {
        headers: { Authorization: `Bearer ${localStorage.getItem('aek-mcp_token') || ''}` },
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
            <option key={g.id} value={g.id}>
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
                    {/* Full config — read-only reference */}
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

                    {/* Inner config — "aek-mcp": { ... } */}
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
