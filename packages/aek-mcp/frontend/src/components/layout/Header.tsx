'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname, useParams } from 'next/navigation';
import { useEmbeddingSync } from '../../contexts/EmbeddingSyncContext';

interface HeaderProps {
  onToggleSidebar: () => void;
}

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const useCrumbs = (): string[] => {
  const { t } = useTranslation();
  const pathname = usePathname();
  return useMemo(() => {
    const segs = pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (segs.length === 0) return [];
    const pageKey = `pages.${segs[segs.length - 1]}.title`;
    const translated = t(pageKey);
    const last = translated !== pageKey ? translated : segs[segs.length - 1];
    return [...segs.slice(0, -1).map((s) => s), last];
  }, [pathname, t]);
};

const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { t, i18n } = useTranslation();
  const { activeSyncs } = useEmbeddingSync();
  const crumbs = useCrumbs();
  const [isDark, setIsDark] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    const nowDark = document.documentElement.classList.contains('dark');
    setIsDark(nowDark);
    localStorage.setItem('theme', nowDark ? 'dark' : 'light');
  };

  const switchLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('i18nextLng', code);
    setShowLangMenu(false);
  };

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  return (
    <header className="hub-topbar shrink-0">
      <button
        onClick={onToggleSidebar}
        className="hub-icon-btn"
        aria-label={t('app.toggleSidebar')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
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
        {/* Theme toggle */}
        <button
          className="hub-icon-btn"
          aria-label={t('settings.appearance.theme.toggle', 'Toggle theme')}
          onClick={toggleTheme}
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Language switcher */}
        <div className="relative">
          <button
            className="hub-icon-btn text-xs"
            aria-label="Language"
            onClick={() => setShowLangMenu((v) => !v)}
            style={{ fontSize: 13, lineHeight: 1 }}
          >
            {currentLang.flag}
          </button>
          {showLangMenu && (
            <div
              className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border py-1"
              style={{ background: 'var(--hub-surface)', borderColor: 'var(--hub-line)' }}
            >
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-[var(--hub-surface-hover)]"
                  style={{
                    color: lang.code === i18n.language ? 'var(--hub-accent)' : 'var(--hub-ink)',
                    fontWeight: lang.code === i18n.language ? 500 : 400,
                  }}
                  onClick={() => switchLang(lang.code)}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GitHub */}
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
