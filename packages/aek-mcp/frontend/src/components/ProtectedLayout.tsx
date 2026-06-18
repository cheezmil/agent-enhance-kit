'use client';

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      router.replace('/login');
    }
  }, [auth.loading, auth.isAuthenticated, router]);

  if (auth.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return null;
  }

  return <MainLayout>{children}</MainLayout>;
}
