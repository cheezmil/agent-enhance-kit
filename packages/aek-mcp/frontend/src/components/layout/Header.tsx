'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname, useParams } from 'next/navigation';
import { Menu, Search, RefreshCw } from 'lucide-react';
import { useEmbeddingSync } from '../../contexts/EmbeddingSyncContext';

interface HeaderProps {
  onToggleSidebar: () => void;
}

const useCrumbs = (): string[] => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const params = useParams();

  return useMemo(() => {
    const path = pathname || '/';
    if (path === '/') return [t('nav.dashboard')];
    if (path.startsWith('/servers')) return [t('nav.servers')];
    if (path.startsWith('/groups')) return [t('nav.groups')];
    if (path.startsWith('/prompts')) return [t('nav.prompts')];
    if (path.startsWith('/resources')) return [t('nav.resources')];
    if (path.startsWith('/users')) return [t('nav.users')];
    if (path.startsWith('/market')) {
      const serverName = (params as { serverName?: string }).serverName;
      const crumbs = [t('nav.market')];
      if (serverName) crumbs.push(serverName);
      return crumbs;
    }
    if (path.startsWith('/logs')) return [t('nav.logs')];
    if (path.startsWith('/activity')) return [t('nav.activity')];
    if (path.startsWith('/keys')) return [t('nav.keys', 'Keys')];
    if (path.startsWith('/settings')) return [t('nav.settings')];
    return [t('nav.dashboard')];
  }, [pathname, params, t]);
};

const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { t } = useTranslation();
  const { activeSyncs } = useEmbeddingSync();
  const crumbs = useCrumbs();

  return (
    <header className="hub-topbar shrink-0">
      <button
        onClick={onToggleSidebar}
        className="hub-icon-btn"
        aria-label={t('app.toggleSidebar')}
      >
        <Menu size={16} />
      </button>

      <div className="hub-crumb flex items-center min-w-0">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {i === crumbs.length - 1 ? <b className="truncate">{c}</b> : <span className="truncate">{c}</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 flex justify-center px-2 min-w-0">
        {activeSyncs.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-center gap-2">
            {activeSyncs.map((activeSync) => (
              <div
                key={activeSync.serverName}
                className="hub-card flex min-w-0 w-56 max-w-full flex-col px-3 py-1.5 text-xs"
                style={{ borderRadius: 7 }}
                title={t('app.embeddingSyncProgressAriaLabel', {
                  serverName: activeSync.serverName,
                  current: activeSync.current,
                  total: activeSync.total,
                })}
              >
                <span className="truncate hub-mono text-[var(--hub-ink-2)]">
                  {t('app.embeddingSyncProgress', { serverName: activeSync.serverName })}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <progress
                    className="h-1.5 flex-1"
                    value={activeSync.current}
                    max={activeSync.total}
                    aria-label={t('app.embeddingSyncProgressAriaLabel', {
                      serverName: activeSync.serverName,
                      current: activeSync.current,
                      total: activeSync.total,
                    })}
                  />
                  <span className="hub-mono text-[10px] text-[var(--hub-ink-3)] whitespace-nowrap">
                    {activeSync.current}/{activeSync.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          className="hub-icon-btn"
          aria-label={t('app.search')}
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
          }}
        >
          <Search size={16} />
        </button>
        <button
          className="hub-icon-btn"
          aria-label={t('settings.appearance.theme.toggle', 'Toggle theme')}
          onClick={() => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
          }}
        >
          {typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '☀' : '☾'}
        </button>
        <button
          className="hub-icon-btn"
          aria-label="GitHub Repository"
          onClick={() => window.open('https://github.com/cheezmil/aek-mcp', '_blank')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
