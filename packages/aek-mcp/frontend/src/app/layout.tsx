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

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServerProvider>
          <ToastProvider>
            <SettingsProvider>
              <EmbeddingSyncAlertListener />
              {children}
            </SettingsProvider>
          </ToastProvider>
        </ServerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Only render children on the client to avoid SSR localStorage errors
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    async function init() {
      try {
        const config = await loadRuntimeConfig();
        (window as any).__MCPHUB_CONFIG__ = config;
      } catch {
        (window as any).__MCPHUB_CONFIG__ = {
          basePath: '',
          version: 'dev',
          name: 'mcphub',
        };
      }
      setMounted(true);
    }
    init();
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>MCPHub Dashboard</title>
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-gray-100">
        <ClientOnly>{children}</ClientOnly>
      </body>
    </html>
  );
}
