import React, { useCallback, useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Wrench,
  MessageSquare,
  FileText,
  MoreHorizontal,
  X,
  Edit3,
  Trash2,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { Server, ServerTokenInput } from '@/types';
import { formatTokens } from '@/utils/contextCost';
import { ServerStatusDot } from '@/components/ui/StatusDot';
import ToolCard from '@/components/ui/ToolCard';
import PromptCard from '@/components/ui/PromptCard';
import ResourceCard from '@/components/ui/ResourceCard';
import DeleteDialog from '@/components/ui/DeleteDialog';
import { Switch } from '@/components/ui/ToggleGroup';
import { useToast } from '@/contexts/ToastContext';
import { useSettingsData } from '@/hooks/useSettingsData';
import { useAuth } from '@/contexts/AuthContext';
import { canManageServer } from '@/utils/serverPermissions';
import { apiPost } from '@/utils/fetchInterceptor';

interface ServerCardProps {
  server: Server;
  tokenInput?: ServerTokenInput;
  onRemove: (serverName: string) => void;
  onEdit: (server: Server) => void;
  onToggle?: (server: Server, enabled: boolean) => Promise<boolean>;
  onRefresh?: () => void;
  onReload?: (server: Server) => Promise<boolean>;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

type CapabilityTabKey = 'tools' | 'prompts' | 'resources';

type CapabilitySummary = {
  key: CapabilityTabKey;
  icon: LucideIcon;
  label: string;
  total: number;
  enabled: number;
};

interface LoadingControlProps {
  isLoading: boolean;
  children: ReactNode;
  className?: string;
  overlayStyle?: CSSProperties;
}

function LoadingControl({ isLoading, children, className = '', overlayStyle }: LoadingControlProps) {
  return (
    <span className={`relative inline-flex ${className}`} style={overlayStyle}>
      {children}
      {isLoading && (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-md"
          style={{ background: 'var(--hub-bg)', opacity: 0.7 }}
        >
          <RefreshCw className="h-3 w-3 animate-spin" style={{ color: 'var(--hub-ink-2)' }} />
        </span>
      )}
    </span>
  );
}

const ServerCard = ({
  server,
  tokenInput,
  onRemove,
  onEdit,
  onToggle,
  onRefresh,
  onReload,
  isFavorite = false,
  onToggleFavorite,
}: ServerCardProps) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { exportMCPSettings, installConfig } = useSettingsData();
  const { auth } = useAuth();
  const baseUrl = installConfig?.baseUrl?.replace(/\/+$/, '') || '';

  const [expanded, setExpanded] = useState(true);
  const [expandedTab, setExpandedTab] = useState<'tools' | 'prompts' | 'resources' | 'tokenInput' | null>(
    'tools',
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadPhase, setReloadPhase] = useState<'idle' | 'detecting' | 'connected' | 'failed'>('idle');
  const [showMenu, setShowMenu] = useState(false);
  const [showErrorPopover, setShowErrorPopover] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const errorPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
      if (errorPopoverRef.current && !errorPopoverRef.current.contains(event.target as Node))
        setShowErrorPopover(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalTools = server.tools?.length || 0;
  const enabledTools = server.tools?.filter((tool) => tool.enabled !== false).length || 0;
  const totalPrompts = server.prompts?.length || 0;
  const enabledPrompts = server.prompts?.filter((p) => p.enabled !== false).length || 0;
  const totalResources = server.resources?.length || 0;
  const enabledResources = server.resources?.filter((r) => r.enabled !== false).length || 0;

  const capabilitySummaries: CapabilitySummary[] = [
    { key: 'tools', icon: Wrench, total: totalTools, enabled: enabledTools, label: t('server.tools') || 'Tools' },
    { key: 'prompts', icon: MessageSquare, total: totalPrompts, enabled: enabledPrompts, label: t('server.prompts') || 'Prompts' },
    { key: 'resources', icon: FileText, total: totalResources, enabled: enabledResources, label: t('server.resources') || 'Resources' },
  ];

  const serverEndpoint = baseUrl
    ? `${baseUrl}/mcp/${server.name}`
    : `/mcp/${server.name}`;

  const enabled = server.enabled !== false;
  const hasError = server.status === 'error' || !!(server as any).lastError;
  const errorText = (server as any).lastError || (server as any).error || '';
  const canManage = canManageServer(server, auth.user);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManage || isToggling || !onToggle) return;
    setIsToggling(true);
    try {
      await onToggle(server, !enabled);
    } finally {
      setIsToggling(false);
    }
  };

  const handleReload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (!canManage || isReloading || !onReload) return;
    setIsReloading(true);
    setReloadPhase('detecting');
    try {
      // Fire the reload API (async on backend)
      const encodedName = encodeURIComponent(server.name);
      await apiPost(`/servers/${encodedName}/reload`, {});

      // Poll until connected or failed (max 30 attempts = ~45s)
      let lastStatus = server.status;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const resp = await fetch(`/api/servers/${encodedName}`, {
            headers: { 'x-auth-token': localStorage.getItem('aek-mcp_token') || '' },
          });
          const data = await resp.json();
          if (data.success && data.data) {
            lastStatus = data.data.status;
            if (lastStatus === 'connected') {
              setReloadPhase('connected');
              // Refresh the list to get updated server state
              onRefresh?.();
              return;
            }
            if (lastStatus === 'disconnected' && i > 2) {
              // Give it a few extra attempts in case it was just briefly disconnected
              if (i >= 5) {
                setReloadPhase('failed');
                onRefresh?.();
                return;
              }
            }
          }
        } catch {
          // continue polling
        }
      }
      // Timed out
      setReloadPhase('failed');
      onRefresh?.();
    } catch {
      setReloadPhase('failed');
    } finally {
      setTimeout(() => {
        setIsReloading(false);
        setReloadPhase('idle');
      }, 2500);
    }
  }, [canManage, isReloading, onReload, server.name, server.status, onRefresh]);

  const copyText = async (value: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // fallback
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
    }
  };

  const handleCopyEndpoint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(serverEndpoint);
    if (ok) showToast(t('common.copied') || 'Copied', 'success');
  };

  const handleCopyError = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(errorText);
    setCopiedError(ok);
    setTimeout(() => setCopiedError(false), 2000);
  };

  const handleOAuth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const authUrl = (server as any).authUrl || (server as any).oauthUrl;
    if (authUrl) window.open(authUrl, '_blank');
  };

  const transportLabel = (type: string): string => {
    const labels: Record<string, string> = {
      sse: 'SSE',
      streamableHttp: 'Streamable HTTP',
      stdio: 'Stdio',
    };
    return labels[type] || type;
  };

  // Determine the display status
  const displayStatus = reloadPhase === 'detecting' ? 'connecting' : server.status;
  const displayLabel = reloadPhase === 'detecting'
    ? (t('server.detecting') || '检测中')
    : undefined;

  return (
    <>
      <div
        className={`hub-server-card-row cursor-pointer px-4 py-3 transition-colors hover:bg-[var(--hub-surface-hover)] ${
          expanded ? 'is-expanded' : ''
        } ${hasError ? 'has-error' : ''}`}
        style={{
          borderBottom: '1px solid var(--hub-line-2)',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {/* Favorite */}
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {onToggleFavorite && (
              <button
                type="button"
                className={`hub-icon-btn ${isFavorite ? 'is-active' : ''}`}
                onClick={onToggleFavorite}
                aria-label="Favorite"
              >
                <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
          </div>

          {/* Server info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium truncate" style={{ color: 'var(--hub-ink)' }}>
                {server.name}
              </span>
            </div>
            {server.config?.description && (
              <div
                className="text-[11.5px] truncate"
                style={{ color: 'var(--hub-ink-3)', marginTop: 1 }}
                title={server.config.description}
              >
                {server.config.description}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="min-w-0">
            <ServerStatusDot
              status={displayStatus as any}
              enabled={server.enabled}
              onAuthClick={handleOAuth}
              className="hub-server-card-status"
              label={displayLabel}
            />
          </div>

          {/* Transport */}
          <div className="min-w-0">
            {server.config?.type ? (
              <span
                className="hub-tag hub-server-card-transport-tag"
                title={transportLabel(t, server.config.type) ?? undefined}
              >
                {transportLabel(t, server.config.type)}
              </span>
            ) : null}
          </div>

          {/* Tools / Prompts / Resources counts */}
          {capabilitySummaries.map(({ key, icon: Icon, total, enabled: enabledCount, label }) => {
            const isEmpty = total === 0;
            return (
              <span
                key={key}
                className={`hub-server-capability-stat hub-mono hub-num ${isEmpty ? 'is-empty' : ''}`}
                title={`${label}: ${enabledCount}/${total}`}
              >
                <span className="text-[var(--hub-ink-3)]">
                  <CapabilityIcon icon={Icon} />
                </span>
                <span className="hub-server-capability-value">
                  {isEmpty ? '0' : `${enabledCount}/${total}`}
                </span>
              </span>
            );
          })}

          {/* Context Footprint stat */}
          {tokenInput ? (
            <span
              className="hub-server-capability-stat hub-mono hub-num"
              title={`${t('tokenInput.exposed')} ${tokenInput?.exposed ?? 0} / ${t('tokenInput.gross')} ${tokenInput?.gross ?? 0}`}
            >
              <span className="text-[var(--hub-ink-3)]">Σ</span>
              <span className="hub-server-capability-value">
                {formatTokens(tokenInput?.exposed)}/{formatTokens(tokenInput?.gross)}
              </span>
            </span>
          ) : null}

          {/* Toggle switch */}
          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <LoadingControl
              isLoading={isToggling}
              className="h-[18px] w-[30px]"
              overlayStyle={{ borderRadius: 9999 }}
            >
              <Switch checked={enabled} onCheckedChange={() => {}} onClick={handleToggle} disabled={!canManage || isToggling} />
            </LoadingControl>
          </div>

          {/* Reload */}
          {onReload && (
            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <button
                className="hub-icon-btn"
                onClick={handleReload}
                disabled={isReloading || isToggling || !enabled}
                aria-label={t('server.reload')}
                title={reloadPhase === 'detecting' ? (t('server.detecting') || '检测中') : t('server.reload')}
              >
                <RefreshCw
                  size={13}
                  className={isReloading ? 'animate-spin' : ''}
                  style={
                    reloadPhase === 'connected'
                      ? { color: '#22c55e' }
                      : reloadPhase === 'failed'
                        ? { color: '#ef4444' }
                        : {}
                  }
                />
              </button>
            </div>
          )}

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            {canManage && (
              <button
                className="hub-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu((v) => !v);
                }}
                aria-label="More"
              >
                <MoreHorizontal size={13} />
              </button>
            )}
            {showMenu && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border py-1"
                style={{ background: 'var(--hub-surface)', borderColor: 'var(--hub-line)' }}
              >
                <MenuButton onClick={(e) => { e.stopPropagation(); onEdit(server); setShowMenu(false); }}>
                  <Edit3 size={13} /> {t('common.edit') || 'Edit'}
                </MenuButton>
                <MenuButton onClick={(e) => { e.stopPropagation(); handleCopyEndpoint(e); setShowMenu(false); }}>
                  <Copy size={13} /> {t('server.copyEndpoint') || 'Copy Endpoint'}
                </MenuButton>
                <div className="my-1" style={{ borderTop: '1px solid var(--hub-line-2)' }} />
                <MenuButton
                  danger
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                    setShowMenu(false);
                  }}
                >
                  <Trash2 size={13} /> {t('common.delete') || 'Delete'}
                </MenuButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-4 pb-3"
          style={{ borderBottom: '1px solid var(--hub-line-2)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Error banner */}
          {hasError && errorText && (
            <div
              className="mb-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <span className="flex-1 break-all" style={{ color: '#ef4444' }}>{errorText}</span>
              <button
                type="button"
                className="shrink-0 p-0.5 rounded hover:bg-black/5"
                onClick={handleCopyError}
                title={t('common.copy') || 'Copy'}
              >
                {copiedError ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}

          {/* Tabs bar */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {capabilitySummaries.map(({ key, icon: Icon, total, enabled: enabledCount, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setExpandedTab(expandedTab === key ? null : key)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] transition-colors hover:bg-[var(--hub-surface-hover)]"
                style={{
                  background: expandedTab === key ? 'var(--hub-surface)' : 'transparent',
                  border: '1px solid ' + (expandedTab === key ? 'var(--hub-line)' : 'transparent'),
                  color: expandedTab === key ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                }}
              >
                <span style={{ color: 'var(--hub-ink-3)' }}><CapabilityIcon icon={Icon} /></span>
                <span>{label}</span>
                <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink-3)', fontSize: 11 }}>{enabledCount}/{total}</span>
              </button>
            ))}

            {tokenInput && (
              <button
                type="button"
                onClick={() => setExpandedTab(expandedTab === 'tokenInput' ? null : 'tokenInput')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] transition-colors hover:bg-[var(--hub-surface-hover)]"
                style={{
                  background: expandedTab === 'tokenInput' ? 'var(--hub-surface)' : 'transparent',
                  border: '1px solid ' + (expandedTab === 'tokenInput' ? 'var(--hub-line)' : 'transparent'),
                  color: expandedTab === 'tokenInput' ? 'var(--hub-ink)' : 'var(--hub-ink-2)',
                }}
                title={t('tokenInput.estimate')}
              >
                <span style={{ color: 'var(--hub-ink-3)' }}>Σ</span>
                <span>{t('tokenInput.totalFootprint')}</span>
                <span
                  className="hub-mono hub-num"
                  style={{ color: 'var(--hub-ink-3)', fontSize: 11 }}
                >
                  {formatTokens(tokenInput?.exposed)}/{formatTokens(tokenInput?.gross)}
                </span>
              </button>
            )}

            {/* Endpoint inline, pushed to the right */}
            <div className="ml-auto max-w-full flex-shrink-0">
              <div className="hub-endpoint" style={{ height: 26 }}>
                <div className="hub-endpoint-label">/mcp/</div>
                <div className="hub-endpoint-url" title={serverEndpoint} style={{ maxWidth: 200 }}>
                  {server.name}
                </div>
                <button
                  type="button"
                  className="hub-endpoint-copy"
                  onClick={handleCopyEndpoint}
                  title={t('common.copy') || 'Copy'}
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Tab content */}
          {expandedTab === 'tools' && server.tools && (
            <div className="space-y-3 mt-2">
              {server.tools.map((tool, index) => (
                <ToolCard
                  key={index}
                  server={server.name}
                  tool={tool}
                  readOnly={!canManage}
                />
              ))}
              {server.tools.length === 0 && (
                <div className="text-xs py-4 text-center" style={{ color: 'var(--hub-ink-3)' }}>
                  {t('server.noTools') || 'No tools configured'}
                </div>
              )}
            </div>
          )}

          {expandedTab === 'prompts' && server.prompts && (
            <div className="space-y-3 mt-2">
              {server.prompts.map((prompt, index) => (
                <PromptCard
                  key={index}
                  server={server.name}
                  prompt={prompt}
                  readOnly={!canManage}
                />
              ))}
              {server.prompts.length === 0 && (
                <div className="text-xs py-4 text-center" style={{ color: 'var(--hub-ink-3)' }}>
                  {t('server.noPrompts') || 'No prompts configured'}
                </div>
              )}
            </div>
          )}

          {expandedTab === 'resources' && server.resources && (
            <div className="space-y-3 mt-2">
              {server.resources.map((resource, index) => (
                <ResourceCard
                  key={index}
                  server={server.name}
                  resource={resource}
                  readOnly={!canManage}
                />
              ))}
              {server.resources.length === 0 && (
                <div className="text-xs py-4 text-center" style={{ color: 'var(--hub-ink-3)' }}>
                  {t('server.noResources') || 'No resources configured'}
                </div>
              )}
            </div>
          )}

          {expandedTab === 'tokenInput' && tokenInput && (
            <div className="mt-2 rounded-md p-3" style={{ background: 'var(--hub-bg-2)', border: '1px solid var(--hub-line-2)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--hub-ink)' }}>
                  {t('tokenInput.totalFootprint')}
                </span>
                <span className="hub-mono hub-num text-xs" style={{ color: 'var(--hub-ink-2)' }}>
                  {formatTokens(tokenInput.exposed)} / {formatTokens(tokenInput.gross)}
                </span>
              </div>
              {tokenInput.items && tokenInput.items.length > 0 && (
                <div className="space-y-1">
                  {tokenInput.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]" style={{ color: 'var(--hub-ink-2)' }}>
                      <span className="flex items-center gap-1.5">
                        <span style={{ color: 'var(--hub-ink-3)' }}>
                          {item.kind === 'tool' ? <Wrench size={10} /> : item.kind === 'prompt' ? <MessageSquare size={10} /> : <FileText size={10} />}
                        </span>
                        <span>{item.name}</span>
                        {!item.enabled && <span className="text-[10px] opacity-50">(disabled)</span>}
                      </span>
                      <span className="hub-mono hub-num">{formatTokens(item.tokens)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete dialog */}
      {showDeleteDialog && (
        <DeleteDialog
          serverName={server.name}
          onConfirm={() => {
            onRemove(server.name);
            setShowDeleteDialog(false);
          }}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </>
  );
};

function CapabilityIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={11} />;
}

function MenuButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-[var(--hub-surface-hover)]"
      style={{ color: danger ? '#ef4444' : 'var(--hub-ink)' }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default ServerCard;
