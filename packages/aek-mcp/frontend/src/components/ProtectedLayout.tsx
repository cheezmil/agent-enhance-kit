'use client';

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';

const MainLayout = dynamic(() => import('../layouts/MainLayout'), { ssr: false });

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Skip auth check for login page
  const isLoginPage = pathname === '/login';
  useEffect(() => {
    if (!isLoginPage && !auth.loading && !auth.isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoginPage, auth.loading, auth.isAuthenticated, router]);

  // Login page renders children directly (no MainLayout wrapper)
  if (isLoginPage) {
    return <>{children}</>;
  }

  // MainLayout loaded client-only to avoid hydration mismatch
  return <MainLayout>{children}</MainLayout>;
}
