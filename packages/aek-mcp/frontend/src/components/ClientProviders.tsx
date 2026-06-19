'use client';

import React, { useEffect, useState } from 'react';
import '../index.css';
import '../i18n';
import '../utils/setupInterceptors';
import { loadRuntimeConfig } from '../utils/runtime';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ServerProvider } from '../contexts/ServerContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import EmbeddingSyncAlertListener from '../components/EmbeddingSyncAlertListener';
import ProtectedLayout from '../components/ProtectedLayout';

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServerProvider>
          <ToastProvider>
            <SettingsProvider>
              <EmbeddingSyncAlertListener />
              <ProtectedLayout>{children}</ProtectedLayout>
            </SettingsProvider>
          </ToastProvider>
        </ServerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Try cached config first, then fetch fresh
    try {
      const raw = localStorage.getItem('aek-mcp_runtime_config');
      if (raw) {
        const config = JSON.parse(raw);
        (window as any).__AEK_MCP_CONFIG__ = config;
        setMounted(true);
        return;
      }
    } catch {}

    loadRuntimeConfig().then((config) => {
      (window as any).__AEK_MCP_CONFIG__ = config;
      setMounted(true);
    }).catch(() => {
      (window as any).__AEK_MCP_CONFIG__ = { basePath: '', version: 'dev', name: 'aek-mcp' };
      setMounted(true);
    });
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
