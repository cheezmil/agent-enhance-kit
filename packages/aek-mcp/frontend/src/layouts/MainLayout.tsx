'use client';

import React, { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import Content from '@/components/layout/Content';
import { EmbeddingSyncProvider } from '@/contexts/EmbeddingSyncContext';

const PageFallback: React.FC = () => (
  <div
    className="flex h-full min-h-[240px] items-center justify-center text-sm"
    style={{ color: 'var(--hub-ink-3)' }}
  >
    Loading...
  </div>
);

interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <EmbeddingSyncProvider>
      <div className="flex h-screen" style={{ background: 'var(--hub-bg)', color: 'var(--hub-ink)' }}>
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <Header onToggleSidebar={toggleSidebar} />
          <Content>
            <Suspense fallback={<PageFallback />}>
              {children}
            </Suspense>
          </Content>
        </div>
      </div>
    </EmbeddingSyncProvider>
  );
};

export default MainLayout;
