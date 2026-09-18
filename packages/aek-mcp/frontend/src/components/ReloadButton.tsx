import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { Server } from '@/types';
import { canManageServer } from '@/utils/serverPermissions';
import { useAuth } from '@/contexts/AuthContext';

interface ReloadButtonProps {
  server: Server;
  onReload: (server: Server) => Promise<boolean>;
  enabled: boolean;
  onStatusChange?: () => void;
}

export default function ReloadButton({ server, onReload, enabled, onStatusChange }: ReloadButtonProps) {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [isReloading, setIsReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<'idle' | 'reloading' | 'connecting' | 'connected' | 'failed'>('idle');

  const canManage = canManageServer(server, auth.user);

  const pollServerStatus = useCallback(async (serverName: string, maxAttempts = 15) => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const encoded = encodeURIComponent(serverName);
        const resp = await fetch(`/api/servers/${encoded}`, {
          headers: { 'x-auth-token': localStorage.getItem('aek-mcp_token') || '' }
        });
        const data = await resp.json();
        if (data.success && data.data) {
          const status = data.data.status;
          if (status === 'connected') {
            setReloadStatus('connected');
            return true;
          }
          if (status === 'error' || status === 'failed') {
            setReloadStatus('failed');
            return false;
          }
        }
      } catch {
        // continue polling
      }
    }
    // Timed out — check one last time
    try {
      const encoded = encodeURIComponent(serverName);
      const resp = await fetch(`/api/servers/${encoded}`, {
        headers: { 'x-auth-token': localStorage.getItem('aek-mcp_token') || '' }
      });
      const data = await resp.json();
      if (data.success && data.data?.status === 'connected') {
        setReloadStatus('connected');
        return true;
      }
    } catch {}
    setReloadStatus('failed');
    return false;
  }, []);

  const handleReload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManage || isReloading || !enabled) return;
    setIsReloading(true);
    setReloadStatus('reloading');
    try {
      const success = await onReload(server);
      if (success) {
        setReloadStatus('connecting');
        const connected = await pollServerStatus(server.name);
        if (connected) {
          // Status already set to 'connected' in pollServerStatus
        } else {
          // Status already set to 'failed' in pollServerStatus
        }
      } else {
        setReloadStatus('failed');
      }
    } catch {
      setReloadStatus('failed');
    } finally {
      setTimeout(() => {
        setIsReloading(false);
        setReloadStatus('idle');
      }, 2000);
      onStatusChange?.();
    }
  }, [canManage, isReloading, enabled, onReload, server, pollServerStatus, onStatusChange]);

  const getStatusLabel = () => {
    switch (reloadStatus) {
      case 'reloading': return t('server.reloading') || 'Reloading...';
      case 'connecting': return t('server.connecting') || 'Connecting...';
      case 'connected': return t('server.connected') || 'Connected';
      case 'failed': return t('server.reloadFailed') || 'Failed';
      default: return t('server.reload') || 'Reload';
    }
  };

  const getButtonStyle = (): React.CSSProperties => {
    if (reloadStatus === 'connected') return { color: '#22c55e' };
    if (reloadStatus === 'failed') return { color: '#ef4444' };
    if (reloadStatus === 'connecting') return { color: '#3b82f6', animation: 'spin 1s linear infinite' };
    return {};
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded p-1 transition-colors hover:bg-[var(--hub-surface-hover)] ${
        !enabled || !canManage || isReloading ? 'opacity-40 cursor-not-allowed' : ''
      }`}
      title={getStatusLabel()}
      onClick={handleReload}
      disabled={isReloading || !canManage || !enabled}
    >
      <RotateCw
        className={`h-3.5 w-3.5 ${isReloading ? 'animate-spin' : ''}`}
        style={getButtonStyle()}
      />
    </button>
  );
}
