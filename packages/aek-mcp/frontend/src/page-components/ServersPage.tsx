import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, AlertCircle, X, Pencil, Save, ArrowLeft, RefreshCw } from 'lucide-react';
import { Server } from '@/types';
import ServerCard from '@/components/ServerCard';
import EditServerForm from '@/components/EditServerForm';
import { useServerData } from '@/hooks/useServerData';
import { useCostData } from '@/hooks/useCostData';
import { filterServers, getServerFilterCounts, type ServerFilter } from '@/utils/serverFilters';
import { apiGet, apiPut } from '@/utils/fetchInterceptor';

const ServersPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    servers,
    allServers,
    error,
    setError,
    isLoading,
    handleServerAdd,
    handleServerEdit,
    handleServerRemove,
    handleServerToggle,
    handleServerVisibilityChange,
    handleServerReload,
    triggerRefresh,
  } = useServerData({ refreshOnMount: true });

  const { serverTokenInputs, refetch: refetchCost } = useCostData();

  useEffect(() => {
    refetchCost();
  }, [servers, refetchCost]);

  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [filter, setFilter] = useState<ServerFilter>(() => {
    try {
      const saved = localStorage.getItem('aek-mcp-server-filter');
      return (saved as ServerFilter) || 'all';
    } catch { return 'all'; }
  });
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('aek-mcp-favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSuccess, setEditorSuccess] = useState(false);

  const toggleFavorite = (name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem('aek-mcp-favorites', JSON.stringify([...next]));
      return next;
    });
  };

  const counts = useMemo(() => getServerFilterCounts(allServers, favorites), [allServers, favorites]);

  const filteredServers = useMemo(() => {
    const base = filter === 'favorites'
      ? servers.filter((s) => favorites.has(s.name))
      : filterServers(servers, filter, search);
    return base.sort((a, b) => a.name.localeCompare(b.name));
  }, [servers, filter, search, favorites]);

  const handleEditClick = async (server: Server) => {
    const fullServerData = await handleServerEdit(server);
    if (fullServerData) setEditingServer(fullServerData);
  };

  const loadSettings = useCallback(async () => {
    setEditorLoading(true);
    setEditorError(null);
    try {
      const res = await apiGet<any>('/mcp-settings/raw');
      if (res.success && res.data) {
        setEditorContent(res.data.content || '');
      } else {
        setEditorError(res.message || 'Failed to load settings');
      }
    } catch (e: any) {
      setEditorError(e.message || 'Failed to load settings');
    } finally {
      setEditorLoading(false);
    }
  }, []);

  const openEditor = () => {
    setIsEditing(true);
    setEditorSuccess(false);
    loadSettings();
  };

  const saveSettings = async () => {
    setEditorSaving(true);
    setEditorError(null);
    setEditorSuccess(false);
    try {
      const res = await apiPut<any>('/mcp-settings/raw', { content: editorContent });
      if (res.success) {
        setEditorSuccess(true);
        triggerRefresh();
        setTimeout(() => {
          setIsEditing(false);
          setEditorSuccess(false);
        }, 1200);
      } else {
        setEditorError(res.message || 'Failed to save');
      }
    } catch (e: any) {
      setEditorError(e.message || 'Failed to save');
    } finally {
      setEditorSaving(false);
    }
  };

  // Editor view
  if (isEditing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button className="hub-btn" onClick={() => setIsEditing(false)}>
            <ArrowLeft size={13} /> {t('common.back', 'Back')}
          </button>
          <div>
            <h1 className="hub-h1" style={{ marginBottom: 0 }}>
              {t('pages.servers.settingsEditor', 'MCP Settings Editor')}
            </h1>
            <p className="hub-sub" style={{ marginTop: 4 }}>
              ~/.aek/mcp/mcp-settings.jsonc
            </p>
          </div>
        </div>

        {editorError && (
          <div
            className="hub-card flex items-center justify-between gap-3 mb-4"
            style={{
              padding: '10px 14px',
              borderColor: 'oklch(0.85 0.1 25)',
              background: 'oklch(0.97 0.03 25)',
              color: 'oklch(0.4 0.18 25)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span className="truncate text-[13px]">{editorError}</span>
            </div>
            <button className="hub-icon-btn sm" onClick={() => setEditorError(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        {editorSuccess && (
          <div
            className="hub-card flex items-center gap-2 mb-4"
            style={{
              padding: '10px 14px',
              borderColor: 'oklch(0.85 0.15 145)',
              background: 'oklch(0.97 0.03 145)',
              color: 'oklch(0.4 0.15 145)',
            }}
          >
            <Save size={14} />
            <span className="text-[13px]">{t('common.saved', 'Saved successfully')}</span>
          </div>
        )}

        <div className="hub-card overflow-hidden">
          {editorLoading ? (
            <div className="p-10 text-center" style={{ color: 'var(--hub-ink-3)' }}>
              {t('app.loading')}
            </div>
          ) : (
            <>
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                className="w-full bg-transparent outline-none text-[13px] font-mono resize-none"
                style={{
                  color: 'var(--hub-ink)',
                  padding: '16px',
                  minHeight: 'calc(100vh - 260px)',
                  lineHeight: 1.6,
                  tabSize: 2,
                }}
                spellCheck={false}
              />
              <div
                className="flex items-center justify-end gap-2 px-4 py-3"
                style={{ borderTop: '1px solid var(--hub-line-2)' }}
              >
                <button className="hub-btn" onClick={() => setIsEditing(false)}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  className="hub-btn primary"
                  onClick={saveSettings}
                  disabled={editorSaving}
                >
                  <Save size={13} />
                  {editorSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="hub-h1">{t('pages.servers.title')}</h1>
        </div>
        <div className="flex gap-2">
          <button className="hub-btn" onClick={openEditor}>
            <Pencil size={13} /> {t('pages.servers.editConfig', 'Edit')}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="hub-card flex items-center justify-between gap-3 mb-4"
          style={{
            padding: '10px 14px',
            borderColor: 'oklch(0.85 0.1 25)',
            background: 'oklch(0.97 0.03 25)',
            color: 'oklch(0.4 0.18 25)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="truncate text-[13px]">{error}</span>
          </div>
          <button
            className="hub-icon-btn sm"
            onClick={() => setError(null)}
            aria-label={t('app.closeButton')}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div
          className="hub-card flex items-center"
          style={{ padding: 2, borderRadius: 7, background: 'var(--hub-surface)' }}
        >
          {(
            [
              ['all', t('common.all') || 'All', counts.all],
              ['favorites', t('common.favorites', '★'), counts.favorites],
              ['online', t('status.online'), counts.online],
              ['issues', t('status.offline') || 'Offline', counts.issues],
              ['disabled', t('pages.dashboard.disabledServers') || 'Disabled', counts.disabled],
            ] as [ServerFilter, string, number][]
          ).map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => { setFilter(k); localStorage.setItem('aek-mcp-server-filter', k); }}
              className="inline-flex items-center gap-1.5 px-3 text-[12px]"
              style={{
                height: 24,
                borderRadius: 5,
                background: filter === k ? 'var(--hub-bg-2)' : 'transparent',
                color: filter === k ? 'var(--hub-ink)' : 'var(--hub-ink-3)',
                border: '1px solid ' + (filter === k ? 'var(--hub-line)' : 'transparent'),
              }}
            >
              {l}
              <span className="hub-mono" style={{ fontSize: 11, color: 'var(--hub-ink-3)' }}>
                {n}
              </span>
            </button>
          ))}
        </div>

        <div
          className="hub-card flex items-center gap-2 px-2.5 flex-1"
          style={{ height: 30, background: 'var(--hub-surface)', maxWidth: 360 }}
        >
          <Search size={13} style={{ color: 'var(--hub-ink-3)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--hub-ink)' }}
            placeholder={t('market.searchPlaceholder') || 'Search…'}
          />
          {search && (
            <button onClick={() => setSearch('')} className="hub-icon-btn sm">
              <X size={11} />
            </button>
          )}
        </div>

        <div className="ml-auto hub-mono text-[12px]" style={{ color: 'var(--hub-ink-3)' }}>
          {filteredServers.length}/{servers.length}
        </div>
      </div>

      {/* List */}
      {isLoading && servers.length === 0 ? (
        <div className="hub-card p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--hub-ink-3)' }} />
            <p style={{ color: 'var(--hub-ink-3)' }}>{t('app.loading')}</p>
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="hub-card p-10 text-center" style={{ color: 'var(--hub-ink-3)' }}>
          <p>{servers.length === 0 ? t('app.noServers') : t('market.noServers')}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              tokenInput={serverTokenInputs.find((c) => c.name === server.name)}
              onRemove={handleServerRemove}
              onEdit={handleEditClick}
              onToggle={handleServerToggle}
              onRefresh={triggerRefresh}
              onReload={handleServerReload}
              isFavorite={favorites.has(server.name)}
              onToggleFavorite={() => toggleFavorite(server.name)}
            />
          ))}
        </div>
      )}

      {editingServer && (
        <EditServerForm
          server={editingServer}
          onEdit={() => {
            setEditingServer(null);
            triggerRefresh();
          }}
          onCancel={() => setEditingServer(null)}
        />
      )}
    </div>
  );
};

export default ServersPage;
