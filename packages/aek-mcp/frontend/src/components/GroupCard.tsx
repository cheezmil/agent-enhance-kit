import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit3, Trash2, Save, X } from 'lucide-react';
import { Group, Server, IGroupServerConfig } from '@/types';
import DeleteDialog from '@/components/ui/DeleteDialog';
import { useToast } from '@/contexts/ToastContext';
import AllowedToolsSelector from '@/components/AllowedToolsSelector';

interface GroupCardProps {
  group: Group;
  servers: Server[];
  onDelete: (groupId: string) => void;
  onUpdate: (
    groupId: string,
    name: string,
    description?: string,
    servers?: string[] | IGroupServerConfig[],
    allowedTools?: string[],
  ) => Promise<boolean>;
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

const GroupCard = ({ group, servers, onDelete, onUpdate }: GroupCardProps) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDescription, setEditDescription] = useState(group.description || '');
  const [editAllowedTools, setEditAllowedTools] = useState<string[]>(group.allowedTools || []);
  const [isSaving, setIsSaving] = useState(false);
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

  // ---------- default group: read-only, show all tools ----------
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

  // ---------- non-default group ----------
  const handleSave = async () => {
    if (!editName.trim()) {
      showToast(t('groups.nameRequired') || 'Name is required', 'error');
      return;
    }
    setIsSaving(true);
    const ok = await onUpdate(
      group.id,
      editName,
      editDescription,
      group.servers,
      editAllowedTools.length > 0 ? editAllowedTools : undefined,
    );
    setIsSaving(false);
    if (ok) {
      showToast(t('common.save') || 'Saved', 'success');
      setIsEditing(false);
    } else {
      showToast(t('groups.updateError') || 'Failed to save', 'error');
    }
  };

  // Inline edit panel (expanded in place)
  if (isEditing) {
    return (
      <div className="hub-card overflow-hidden">
        <div
          className="flex items-start justify-between gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--hub-line-2)' }}
        >
          <div className="flex-1 min-w-0">
            <input
              className="w-full bg-transparent text-[15px] font-semibold outline-none border-b border-dashed border-[var(--hub-line-2)] pb-1"
              style={{ letterSpacing: '-0.015em', color: 'var(--hub-ink)' }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('groups.namePlaceholder') || 'Group name'}
            />
            <textarea
              className="w-full bg-transparent text-[12.5px] outline-none mt-1.5 resize-none"
              style={{ color: 'var(--hub-ink-3)', lineHeight: 1.4 }}
              rows={1}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t('common.description') || 'Description'}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="hub-btn primary sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                t('common.submitting') || 'Saving…'
              ) : (
                <>
                  <Save size={13} /> {t('common.save') || 'Save'}
                </>
              )}
            </button>
            <button className="hub-btn sm" onClick={() => setIsEditing(false)}>
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3" style={{ background: 'var(--hub-bg-2)' }}>
          <AllowedToolsSelector
            servers={servers}
            value={editAllowedTools}
            onChange={setEditAllowedTools}
          />
        </div>
      </div>
    );
  }

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
            {!(group.allowedTools && group.allowedTools.length > 0) && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] hub-mono"
                style={{
                  background: 'var(--hub-bg-2)',
                  color: 'var(--hub-ink-3)',
                  border: '1px solid var(--hub-line-2)',
                }}
              >
                {t('groups.allToolsExposed') || 'All tools exposed'}
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
            onClick={() => setIsEditing(true)}
            className="hub-icon-btn sm"
            title={t('groups.edit') || 'Configure tools'}
          >
            <Edit3 size={13} />
          </button>
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

      {/* Summary footer */}
      <div
        className="px-4 py-2.5"
        style={{
          borderTop: '1px solid var(--hub-line-2)',
          background: 'var(--hub-bg-2)',
          fontSize: 12,
          color: 'var(--hub-ink-2)',
        }}
      >
        <div className="flex items-center gap-3 flex-wrap hub-mono">
          <span>
            <b style={{ color: 'var(--hub-ink)' }}>
              {Array.isArray(group.servers) ? group.servers.length : 0}
            </b>
            <span style={{ color: 'var(--hub-ink-3)' }}> {t('nav.servers').toLowerCase()}</span>
          </span>
          <span>
            <b style={{ color: 'var(--hub-ink)' }}>
              {group.allowedTools ? group.allowedTools.length : '—'}
            </b>
            <span style={{ color: 'var(--hub-ink-3)' }}> {t('server.tools').toLowerCase()}</span>
          </span>
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
