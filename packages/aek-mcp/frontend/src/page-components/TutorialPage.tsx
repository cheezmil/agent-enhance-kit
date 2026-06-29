'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, BookOpen, RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { getApiUrl } from '@/utils/runtime';

interface TutorialConfig {
  username: string;
  key: string;
  mcpURL: string;
  host: string;
  port: string;
  basePath: string;
}

interface AgentTool {
  id: string;
  name: string;
  description: string;
  configPath: string;
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

function buildInnerConfig(name: string, cfg: TutorialConfig, extra?: Record<string, unknown>): string {
  const obj: Record<string, unknown> = {
    type: 'streamable-http',
    url: cfg.mcpURL,
    env: { AEK_MCP_KEY: cfg.key },
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
    url: cfg.mcpURL,
    env: { AEK_MCP_KEY: cfg.key },
    enabled: true,
    ...extra,
  };
  return JSON.stringify({ mcp: { [name]: obj } }, null, 2);
}

const AGENT_TOOLS: AgentTool[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'opencode.jsonc',
    configPath: 'opencode.jsonc',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg, { timeout: 6600000 }),
      full: buildFullConfig('aek-mcp', cfg, { timeout: 6600000 }),
    }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: 'claude_desktop_config.json',
    configPath: '~/Library/Application Support/Claude/claude_desktop_config.json',
    docUrl: 'https://docs.anthropic.com/en/docs/claude-desktop/mcp',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: '.cursor/mcp.json',
    configPath: '.cursor/mcp.json',
    docUrl: 'https://docs.cursor.com/context/model-context-protocol',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: '~/.codeium/windsurf/mcp_config.json',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    description: '.vscode/mcp.json',
    configPath: '.vscode/mcp.json',
    docUrl: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    description: 'hermes_config.yaml',
    configPath: '~/.hermes/profiles/default/hermes_config.yaml',
    buildConfig: (cfg) => ({
      inner: `"aek-mcp":\n  type: streamable-http\n  url: "${cfg.mcpURL}"\n  env:\n    AEK_MCP_KEY: "${cfg.key}"`,
      full: `mcp:\n  aek-mcp:\n    type: streamable-http\n    url: "${cfg.mcpURL}"\n    env:\n      AEK_MCP_KEY: "${cfg.key}"`,
    }),
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'cline_mcp_settings.json',
    configPath: '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    description: 'MCP 服务器配置',
    configPath: '设置 > MCP 服务器',
    buildConfig: (cfg) => ({
      inner: buildInnerConfig('aek-mcp', cfg),
      full: buildFullConfig('aek-mcp', cfg),
    }),
  },
];

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
  const [config, setConfig] = useState<TutorialConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/tutorial/config'), {
        headers: { Authorization: `Bearer ${localStorage.getItem('aek-mcp_token') || ''}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setConfig(data.data);
        setExpandedTools(new Set(AGENT_TOOLS.map((t) => t.id)));
      } else {
        setError(data.message || 'Failed to load config');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

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
            {AGENT_TOOLS.map((tool) => {
              const { inner, full } = tool.buildConfig(config);
              const isExpanded = expandedTools.has(tool.id);

              return (
                <div key={tool.id} className="hub-card overflow-hidden">
                  <button
                    onClick={() => {
                      const next = new Set(expandedTools);
                      if (next.has(tool.id)) next.delete(tool.id);
                      else next.add(tool.id);
                      setExpandedTools(next);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--hub-surface-hover)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[14px] text-[var(--hub-ink)]">{tool.name}</div>
                      <div className="text-[12px] text-[var(--hub-ink-3)] font-mono">{tool.configPath}</div>
                    </div>
                    {tool.docUrl && (
                      <a
                        href={tool.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[var(--hub-ink-3)] hover:text-[var(--hub-ink)] transition-colors"
                        title={t('tutorial.docs', 'Documentation')}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <svg
                      className={`w-4 h-4 text-[var(--hub-ink-3)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
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
                  )}
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
