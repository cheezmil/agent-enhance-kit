'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Server, FolderTree, FileText, Database, Key, Settings, Shield, BarChart3,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import UserProfileMenu from '../UserProfileMenu';

interface SidebarProps {
  collapsed: boolean;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  show?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { auth } = useAuth();
  const [appVersion, setAppVersion] = useState('dev');

  useEffect(() => {
    fetch('/public-config')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.appVersion) setAppVersion(d.data.appVersion);
      })
      .catch(() => {});
  }, []);

  const userCanManageUsers = auth.user?.isAdmin || auth.user?.role === 'admin';

  const workspaceItems: NavItem[] = [
    { href: '/servers', labelKey: 'nav.servers', icon: <Server size={18} /> },
    { href: '/groups', labelKey: 'nav.groups', icon: <FolderTree size={18} /> },
    { href: '/prompts', labelKey: 'nav.prompts', icon: <FileText size={18} /> },
    { href: '/resources', labelKey: 'nav.resources', icon: <Database size={18} /> },
    { href: '/keys', labelKey: 'nav.keys', icon: <Key size={18} /> },
  ];

  const systemItems: NavItem[] = [
    { href: '/settings', labelKey: 'nav.settings', icon: <Settings size={18} /> },
  ];

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          'hub-nav-item ' +
          (isActive ? 'hub-nav-active' : '')
        }
        title={collapsed ? t(item.labelKey) : undefined}
      >
        <span className="flex items-center justify-center w-5 h-5 shrink-0">{item.icon}</span>
        {!collapsed && (
          <span className="truncate text-[13px]">{t(item.labelKey)}</span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={
        'flex flex-col h-full relative shrink-0 transition-[width] duration-200 ease-out ' +
        'bg-[var(--hub-bg-2)] backdrop-blur-[40px] backdrop-saturate-[180%] ' +
        'border-r border-[var(--hub-line)] ' +
        (collapsed ? 'w-14' : 'w-[232px]')
      }
    >
      {/* Brand */}
      <div className={'flex items-center gap-2.5 ' + (collapsed ? 'px-2 py-3 justify-center' : 'px-4 py-3')}>
        <div
          className="relative grid h-7 w-7 place-items-center rounded-md text-white hub-mono text-[12px] font-semibold"
          style={{
            background:
              'linear-gradient(135deg, var(--hub-accent), oklch(0.62 0.18 285))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
          }}
        >
          <span>M</span>
          <span
            className="absolute -right-0.5 -bottom-0.5 w-[6px] h-[6px] rounded-full"
            style={{
              background: 'var(--hub-ok)',
              boxShadow: '0 0 0 2px oklch(0.66 0.15 145 / 0.18)',
            }}
          />
        </div>
        {!collapsed && (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-semibold tracking-tight text-[var(--hub-ink)] truncate">
              {t('app.title')}
            </span>
            {appVersion && (
              <span className="hub-mono text-[10.5px] text-[var(--hub-ink-3)] flex-shrink-0">
                {appVersion === 'dev' ? appVersion : `v${appVersion}`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {!collapsed && <div className="hub-sect px-3 pt-2 pb-1.5">{t('nav.workspace')}</div>}
        <nav className={'flex flex-col gap-px ' + (collapsed ? 'px-1.5' : 'px-2')}>
          {workspaceItems.map(renderItem)}
        </nav>

        {!collapsed && <div className="hub-sect px-3 pt-3 pb-1.5">{t('nav.system')}</div>}
        <nav className={'flex flex-col gap-px ' + (collapsed ? 'px-1.5 mt-1' : 'px-2')}>
          {systemItems.map(renderItem)}
        </nav>
      </div>

      <div className="p-2.5 border-t border-[var(--hub-line)]">
        <UserProfileMenu collapsed={collapsed} version={appVersion} />
      </div>
    </aside>
  );
};

export default Sidebar;
