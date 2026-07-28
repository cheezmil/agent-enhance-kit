import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Pencil } from 'lucide-react';
import { Group, Server } from '@/types';
import DeleteDialog from '@/components/ui/DeleteDialog';
import { useToast } from '@/contexts/ToastContext';

interface GroupCardProps {
  group: Group;
  servers: Server[];
  onDelete: (groupId: string) => void;
  onEdit?: (group: Group) => void;
}

const copyText = async (value: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* noop */
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
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

const GroupCard = ({ group, servers, onDelete, onEdit }: GroupCardProps) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const isDefault = group.name === 'default';
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCopyDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const doCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setShowCopyDropdown(false);
      showToast(t('common.copySuccess') || 'Copied', 'success');
      setTimeout(() => setCopied(false), 1500);
    } else {
      showToast(t('common.copyFailed') || 'Copy failed', 'error');
    }
  };

  // ---------- default group: read-only, show summary ----------
  if (isDefault) {
    const totalServers = servers.length;
    const totalTools = servers.reduce((acc, s) => acc + (s.tools?.length || 0), 0);
    const totalPrompts = servers.reduce((acc, s) => acc + (s.prompts?.length || 0), 0);
    const totalResources = servers.reduce((acc, s) => acc + (s.resources?.length || 0), 0);

    return (
      <div className="hub-card overflow-hidden">
        <div
          className="flex items-start justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--hub-line-2)' }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>
                {group.name}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] hub-mono"
                style={{
                  background: 'var(--hub-bg-2)',
                  color: 'var(--hub-ok)',
                  border: '1px solid var(--hub-ok)',
                }}
              >
                {t('groups.defaultGroup') || 'All tools exposed'}
              </span>
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3"
          style={{
            background: 'var(--hub-bg-2)',
            fontSize: 12,
            color: 'var(--hub-ink-2)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{totalServers}</span>
            <span style={{ color: 'var(--hub-ink-3)' }}>{t('nav.servers').toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{totalTools}</span>
            <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.tools').toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{totalPrompts}</span>
            <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.prompts').toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{totalResources}</span>
            <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.resources').toLowerCase()}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------- non-default group: editable, deletable ----------
  const groupServerNames = new Set(
    (group.servers || [])
      .map((s) => (typeof s === 'string' ? s : s.name))
      .filter(Boolean),
  );
  const groupServers = servers.filter((s) => groupServerNames.has(s.name));
  const grpTotalServers = groupServers.length;
  const grpTotalTools = groupServers.reduce((acc, s) => acc + (s.tools?.length || 0), 0);
  const grpTotalPrompts = groupServers.reduce((acc, s) => acc + (s.prompts?.length || 0), 0);
  const grpTotalResources = groupServers.reduce((acc, s) => acc + (s.resources?.length || 0), 0);

  return (
    <div className="hub-card overflow-hidden">
      <div
        className="flex items-start justify-between gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--hub-line-2)' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>
              {group.name}
            </span>
            {group.allowedTools && group.allowedTools.length > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] hub-mono"
                style={{
                  background: 'var(--hub-bg-2)',
                  color: 'var(--hub-warn)',
                  border: '1px solid var(--hub-warn)',
                }}
              >
                {t('groups.allowedToolsCount', { count: group.allowedTools.length }) || `${group.allowedTools.length} tools`}
              </span>
            )}
          </div>
          {group.description && (
            <div style={{ fontSize: 12.5, color: 'var(--hub-ink-3)', marginTop: 2 }}>
              {group.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1" ref={dropdownRef}>
          {onEdit && (
            <button
              onClick={() => onEdit(group)}
              className="hub-icon-btn sm"
              title={t('groups.edit') || 'Edit'}
            >
              <Pencil size={13} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowCopyDropdown((v) => !v)}
              className="hub-icon-btn sm"
              title={t('common.copy')}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--hub-ok)]">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>
            {showCopyDropdown && (
              <div
                className="absolute top-full right-0 mt-1 z-20 hub-card"
                style={{ minWidth: 160, padding: 4 }}
              >
                <button
                  onClick={() => doCopy(group.id)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[13px] rounded-md hover:bg-[var(--hub-surface-hover)] text-left"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="14" height="14" x="8" y="8" rx="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  {t('common.copyId')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="hub-icon-btn sm"
            title={t('groups.delete') || 'Delete'}
            style={{ color: 'var(--hub-ink-3)' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3"
        style={{
          background: 'var(--hub-bg-2)',
          fontSize: 12,
          color: 'var(--hub-ink-2)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{grpTotalServers}</span>
          <span style={{ color: 'var(--hub-ink-3)' }}>{t('nav.servers').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{grpTotalTools}</span>
          <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.tools').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{grpTotalPrompts}</span>
          <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.prompts').toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hub-mono hub-num" style={{ color: 'var(--hub-ink)', fontWeight: 600 }}>{grpTotalResources}</span>
          <span style={{ color: 'var(--hub-ink-3)' }}>{t('server.resources').toLowerCase()}</span>
        </div>
      </div>

      <DeleteDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => {
          onDelete(group.id);
          setShowDeleteDialog(false);
        }}
        serverName={group.name}
        isGroup
      />
    </div>
  );
};

export default GroupCard;
